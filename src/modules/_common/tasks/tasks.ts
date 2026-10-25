import { setTimeout as sleep } from "node:timers/promises";
import { injectable, unmanaged } from "inversify";
import { getConstructionPlans, type JobWithMetadata, PgBoss } from "pg-boss";

import {
  connectionConfigFromEnv,
  type DatabaseConnectionConfig,
} from "../../../db/client.js";
import type { DatabaseError } from "../../../db/types.js";
import { Failure, type Result, Success } from "../../../types/index.js";
import { Logger } from "../logger/logger.js";
import { tryCatch } from "../try-catch.js";
import { type AnyTask, TASKS, type Task } from "./task-definitions.js";

export type RunId = string;

export type TaskAlreadyRunningError = { type: "TASK_ALREADY_RUNNING" };

export type TaskHandler<Data extends object, Output> = (
  data: Data,
  signal: AbortSignal,
) => Promise<Output>;

export type RunState = "queued" | "running" | "completed" | "failed";

export type LatestRun = {
  task: string;
  runId: RunId;
  state: RunState;
  requestedAt: Date;
  startedAt: Date | null;
  endedAt: Date | null;
};

export type TasksOptions = {
  connection: DatabaseConnectionConfig;
  tasks?: readonly AnyTask[];
};

// Docker gives a container 10 seconds between SIGTERM and SIGKILL. A run still
// active after this is failed by pg-boss rather than left to its heartbeat.
const STOP_TIMEOUT_MS = 5_000;

@injectable()
export class Tasks {
  private readonly boss: PgBoss;
  private readonly tasks: readonly AnyTask[];

  constructor(
    private readonly logger: Logger,
    @unmanaged()
    options: TasksOptions = { connection: connectionConfigFromEnv() },
  ) {
    this.logger.setContext(Tasks.name);
    this.tasks = options.tasks ?? TASKS;
    this.boss = new PgBoss({
      ...options.connection,
      migrate: false,
      schedule: false,
    });
    this.boss.on("error", (error) => {
      this.logger.error({ message: "pg-boss error", error });
    });
    this.boss.on("warning", (warning) => {
      this.logger.warn(`pg-boss warning: ${warning.message}`);
    });
  }

  async start(): Promise<void> {
    await this.boss.start();
    for (const task of this.tasks) {
      await this.boss.createQueue(task.name, {
        policy: "exclusive",
        retryLimit: 0,
        heartbeatSeconds: task.heartbeatSeconds,
        expireInSeconds: task.expireInSeconds,
      });
    }
  }

  async stop(): Promise<void> {
    await this.boss.stop({ graceful: true, timeout: STOP_TIMEOUT_MS });
  }

  async request<Data extends object>(
    task: Task<Data, unknown>,
    data: Data,
  ): Promise<Result<RunId, TaskAlreadyRunningError | DatabaseError>> {
    const result = await tryCatch(this.boss.send(task.name, data));
    if (!result.ok) {
      return Failure({ type: "DATABASE", error: result.error } as const);
    }
    if (result.value === null) {
      return Failure({ type: "TASK_ALREADY_RUNNING" } as const);
    }
    return Success(result.value);
  }

  /** One entry per task that has a run, among the runs pg-boss still keeps. */
  async latestRuns(): Promise<Result<LatestRun[], DatabaseError>> {
    const result = await tryCatch(
      Promise.all(this.tasks.map((task) => this.boss.findJobs(task.name))),
    );
    if (!result.ok) {
      return Failure({ type: "DATABASE", error: result.error } as const);
    }

    const latestRuns: LatestRun[] = [];
    for (const [index, runs] of result.value.entries()) {
      // findJobs lists oldest first, up to 1000: far more than a task's runs
      // in the week pg-boss keeps them.
      const run = runs.at(-1);
      if (run) {
        latestRuns.push({
          task: this.tasks[index].name,
          runId: run.id,
          state: toRunState(run.state),
          requestedAt: run.createdOn,
          startedAt: run.startedOn ?? null,
          endedAt: run.completedOn,
        });
      }
    }
    return Success(latestRuns);
  }

  async work<Data extends object, Output>(
    task: Task<Data, Output>,
    handler: TaskHandler<Data, Output>,
  ): Promise<void> {
    await this.boss.work<Data, Output>(task.name, async ([job]) => {
      this.logger.info(`Run ${job.id} of ${task.name} started`);
      try {
        const output = await handler(job.data, job.signal);
        this.logger.info(`Run ${job.id} of ${task.name} completed`);
        return output;
      } catch (error) {
        this.logger.error({
          message: `Run ${job.id} of ${task.name} failed`,
          error,
        });
        throw error;
      }
    });
  }
}

function toRunState(state: JobWithMetadata["state"]): RunState {
  switch (state) {
    case "created":
    case "retry":
      return "queued";
    case "active":
      return "running";
    case "completed":
      return "completed";
    case "failed":
    case "cancelled":
      return "failed";
  }
}

const SCHEMA_UPGRADE_POLL_MS = 1_000;

/**
 * Installs pg-boss's schema, or upgrades it to this pg-boss version. Only the
 * migrate step calls it: every `Tasks` refuses to start on a mismatched schema.
 */
export async function installTaskSchema(
  connection: DatabaseConnectionConfig,
): Promise<void> {
  const boss = new PgBoss({
    ...connection,
    migrate: true,
    supervise: false,
    schedule: false,
    registerInstance: false,
  });
  await boss.start();
  try {
    // An upgrade can leave index builds for a background worker that only runs
    // while a migrating instance is alive, so wait for them before stopping.
    while (
      (await boss.getBamStatus()).some(
        ({ status, count }) =>
          (status === "pending" || status === "in_progress") && count > 0,
      )
    ) {
      await sleep(SCHEMA_UPGRADE_POLL_MS);
    }
  } finally {
    await boss.stop();
  }
}

/** Changes whenever the schema `installTaskSchema` installs does. */
export function taskSchemaDefinition(): string {
  return getConstructionPlans();
}
