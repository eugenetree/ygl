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

export type RunError =
  | { type: "HANDLER_THREW"; message: string }
  | { type: "WORKER_STOPPED_RESPONDING" }
  | { type: "TIMED_OUT" }
  | { type: "WORKER_SHUT_DOWN" };

export type RunOutcome =
  | { outcome: "completed"; output: unknown }
  | { outcome: "failed"; error: RunError };

type RunEndedAt<Time> = {
  task: string;
  runId: RunId;
  requestedAt: Time;
  startedAt: Time;
  endedAt: Time;
} & RunOutcome;

export type RunEnded = RunEndedAt<Date>;

export type RunEndedHandler = (run: RunEnded) => Promise<void>;

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
  /** How often runs whose worker died are failed. pg-boss's default is 60. */
  monitorIntervalSeconds?: number;
};

const RUN_ENDED_EVENT = "task-run-ended";
// pg-boss copies every run that fails here, whatever failed it.
const FAILED_RUNS_QUEUE = "task-failed-runs";
// An `onRunEnded` handler that throws, say while Telegram is unreachable, gets
// the run again later: 30 s, then doubling, for about two hours.
const RUN_ENDED_RETRIES = {
  retryLimit: 8,
  retryDelay: 30,
  retryBackoff: true,
};

// Marks a failure the wrapper has already published, so the failed runs
// worker doesn't report it a second time.
const PUBLISHED_RUN_ERROR = "PublishedRunError";

class PublishedRunError extends Error {
  override name = PUBLISHED_RUN_ERROR;
}

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
      // pg-boss rejects an interval given as undefined.
      ...(options.monitorIntervalSeconds && {
        superviseIntervalSeconds: options.monitorIntervalSeconds,
        monitorIntervalSeconds: options.monitorIntervalSeconds,
      }),
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
    // Every process subscribes, not only the bot: a publish with no
    // subscription is dropped, and the bot may be down when a run ends.
    await this.boss.createQueue(RUN_ENDED_EVENT, RUN_ENDED_RETRIES);
    await this.boss.subscribe(RUN_ENDED_EVENT, RUN_ENDED_EVENT);
    await this.boss.createQueue(FAILED_RUNS_QUEUE, RUN_ENDED_RETRIES);
    for (const task of this.tasks) {
      const settings = {
        retryLimit: 0,
        heartbeatSeconds: task.heartbeatSeconds,
        expireInSeconds: task.expireInSeconds,
        deadLetter: FAILED_RUNS_QUEUE,
      };
      await this.boss.createQueue(task.name, {
        ...settings,
        policy: "exclusive",
      });
      // createQueue leaves an existing queue's settings as they were.
      await this.boss.updateQueue(task.name, settings);
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
    await this.boss.work<Data, Output, { includeMetadata: true }>(
      task.name,
      { includeMetadata: true },
      async ([job]) => {
        const run = {
          task: task.name,
          runId: job.id,
          requestedAt: job.createdOn,
          startedAt: job.startedOn,
        };
        this.logger.info(`Run ${job.id} of ${task.name} started`);
        // pg-boss aborts the signal once it has failed the run itself, on
        // stop(), expiry or a lost claim. The failed runs worker reports those.
        const failedByPgBoss = () => job.signal.aborted;
        let output: Output;
        try {
          output = await handler(job.data, job.signal);
        } catch (error) {
          this.logger.error({
            message: `Run ${job.id} of ${task.name} failed`,
            error,
          });
          if (failedByPgBoss()) {
            throw error;
          }
          await this.publishRunEnded({
            ...run,
            endedAt: new Date(),
            outcome: "failed",
            error: {
              type: "HANDLER_THREW",
              message: error instanceof Error ? error.message : String(error),
            },
          });
          throw new PublishedRunError(`Run ${job.id} failed`, {
            cause: error,
          });
        }
        if (failedByPgBoss()) {
          return output;
        }
        this.logger.info(`Run ${job.id} of ${task.name} completed`);
        await this.publishRunEnded({
          ...run,
          endedAt: new Date(),
          outcome: "completed",
          output,
        });
        return output;
      },
    );
  }

  async onRunEnded(handler: RunEndedHandler): Promise<void> {
    // The event arrives as JSON, so its dates arrive as strings.
    await this.boss.work<RunEndedAt<string>>(RUN_ENDED_EVENT, async ([job]) => {
      await handler({
        ...job.data,
        requestedAt: new Date(job.data.requestedAt),
        startedAt: new Date(job.data.startedAt),
        endedAt: new Date(job.data.endedAt),
      });
    });

    await this.boss.work(
      FAILED_RUNS_QUEUE,
      { includeMetadata: true },
      async ([job]) => {
        const error = failedRunError(job.sourceOutput);
        if (job.sourceName === null || job.sourceId === null || !error) {
          return;
        }
        const [run] = await this.boss.findJobs(job.sourceName, {
          id: job.sourceId,
        });
        await handler({
          task: job.sourceName,
          runId: job.sourceId,
          requestedAt: job.sourceCreatedOn ?? job.createdOn,
          // pg-boss deletes a run 7 days after it ends.
          startedAt: run?.startedOn ?? job.createdOn,
          endedAt: run?.completedOn ?? job.createdOn,
          outcome: "failed",
          error,
        });
      },
    );
  }

  private async publishRunEnded(run: RunEnded): Promise<void> {
    await this.boss.publish(RUN_ENDED_EVENT, run);
  }
}

/** Why a failed run failed, from its stored output, or null if already published. */
function failedRunError(output: object | null): RunError | null {
  if (output && "name" in output && output.name === PUBLISHED_RUN_ERROR) {
    return null;
  }
  const message = failureMessage(output);
  // The messages pg-boss fails a run with itself.
  if (message === "job heartbeat timeout") {
    return { type: "WORKER_STOPPED_RESPONDING" };
  }
  if (
    message === "job timed out" ||
    message.startsWith("handler execution exceeded")
  ) {
    return { type: "TIMED_OUT" };
  }
  if (message.startsWith("pg-boss shut down")) {
    return { type: "WORKER_SHUT_DOWN" };
  }
  return { type: "HANDLER_THREW", message };
}

// pg-boss stores a thrown error as is, and wraps anything else in `value`.
function failureMessage(output: object | null): string {
  const failure = output && "value" in output ? output.value : output;
  if (typeof failure === "string") {
    return failure;
  }
  if (
    typeof failure === "object" &&
    failure !== null &&
    "message" in failure &&
    typeof failure.message === "string"
  ) {
    return failure.message;
  }
  return JSON.stringify(output);
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
