import { injectable } from "inversify";
import type { JobWithMetadata, PgBoss } from "pg-boss";

import type { DatabaseError } from "../../../db/types.js";
import { Failure, type Result, Success } from "../../../types/index.js";
import type { BaseError } from "../errors.js";
import { Logger } from "../logger/logger.js";
import { tryCatch } from "../try-catch.js";
import { EventBus, type EventDefinition } from "./event-bus.js";
import { FAILED_RUNS_QUEUE } from "./failed-runs.js";
import { failureError } from "./failure-error.js";
import { MessagingConnection } from "./messaging-connection.js";
import type { RunCompleted, RunId } from "./runs.js";

export type Task<Output> = {
  readonly name: string;
  readonly expireInSeconds: number;
  /** 60 when left out. */
  readonly heartbeatSeconds?: number;
  readonly runCompleted: EventDefinition<RunCompleted<Output>>;
};

export type AnyTask = Task<unknown>;

export type TaskHandler<Output> = (
  signal: AbortSignal,
) => Promise<Result<Output, BaseError>>;

export type TaskAlreadyRunningError = { type: "TASK_ALREADY_RUNNING" };

export type TaskNotSetUpError = { type: "TASK_NOT_SET_UP" };

export type RunState = "queued" | "running" | "completed" | "failed";

export type LatestRun = {
  task: string;
  runId: RunId;
  state: RunState;
  requestedAt: Date;
  startedAt: Date | null;
  endedAt: Date | null;
};

const DEFAULT_HEARTBEAT_SECONDS = 60;

// pg-boss doesn't export the code it gives an error for a missing queue.
const QUEUE_NOT_FOUND = "PGBOSS_QUEUE_NOT_FOUND";

/**
 * Requesting runs, working them, and reading them back.
 *
 * - A task's queue is created by its first `work`, with the task's settings.
 *   Until a worker of it has started once, `request` fails with
 *   `TASK_NOT_SET_UP` and `latestRuns` reports no run of it.
 * - At most one run of a task is queued or running at a time.
 * - A run's handler gets a signal that aborts once the run is no longer its
 *   own: on shutdown, past the task's expiry, or when its claim is lost.
 * - A run never retries. Every run ends completed, announced by its task's
 *   completed event, or failed, announced by `TASK_RUN_FAILED`: whether its
 *   handler failed, its worker stopped responding, it timed out or its worker
 *   shut down. Each is announced at least once, so possibly twice.
 * - `latestRuns` reads runs while their workers are down, for 7 days after
 *   they end.
 */
@injectable()
export class TaskQueue {
  private readonly boss: PgBoss;
  private readonly logger: Logger;

  constructor(
    private readonly messagingConnection: MessagingConnection,
    private readonly eventBus: EventBus,
    logger: Logger,
  ) {
    this.boss = messagingConnection.boss;
    this.logger = logger.child({ context: TaskQueue.name });
  }

  async request(
    task: AnyTask,
  ): Promise<
    Result<RunId, TaskAlreadyRunningError | TaskNotSetUpError | DatabaseError>
  > {
    const result = await tryCatch(this.boss.send(task.name, {}));
    if (!result.ok) {
      if (isQueueNotFound(result.error)) {
        return Failure({ type: "TASK_NOT_SET_UP" } as const);
      }
      return Failure({ type: "DATABASE", error: result.error } as const);
    }
    if (result.value === null) {
      return Failure({ type: "TASK_ALREADY_RUNNING" } as const);
    }
    return Success(result.value);
  }

  /** One entry per task that has a run, among the runs pg-boss still keeps. */
  async latestRuns(
    tasks: readonly AnyTask[],
  ): Promise<Result<LatestRun[], DatabaseError>> {
    const result = await tryCatch(
      Promise.all(tasks.map((task) => this.runsOf(task))),
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
          task: tasks[index].name,
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

  private async runsOf(task: AnyTask) {
    try {
      return await this.boss.findJobs(task.name);
    } catch (error) {
      if (isQueueNotFound(error)) {
        return [];
      }
      throw error;
    }
  }

  async work<Output>(
    task: Task<Output>,
    handler: TaskHandler<Output>,
  ): Promise<void> {
    await this.createQueue(task);
    await this.boss.work<object, Output, { includeMetadata: true }>(
      task.name,
      { includeMetadata: true },
      async ([job]) => {
        this.logger.info(`Run ${job.id} of ${task.name} started`);
        const result = await handler(job.signal);
        if (!result.ok) {
          const error = failureError(result.error);
          this.logger.error({
            message: `Run ${job.id} of ${task.name} failed`,
            error,
          });
          throw error;
        }
        // pg-boss aborts the signal once it has failed the run itself, on
        // stop(), expiry or a lost claim, so the run didn't complete.
        if (job.signal.aborted) {
          return result.value;
        }
        this.logger.info(`Run ${job.id} of ${task.name} completed`);
        const published = await tryCatch(
          this.eventBus.publish(task.runCompleted, {
            task: task.name,
            runId: job.id,
            requestedAt: job.createdOn,
            startedAt: job.startedOn,
            endedAt: new Date(),
            output: result.value,
          }),
        );
        // Throwing would fail a run whose work is done, to report one message.
        if (!published.ok) {
          this.logger.error({
            message: `Failed to publish that run ${job.id} of ${task.name} completed`,
            error: published.error,
          });
        }
        return result.value;
      },
    );
  }

  private async createQueue(task: AnyTask): Promise<void> {
    await this.messagingConnection.createQueue(
      task.name,
      {
        retryLimit: 0,
        heartbeatSeconds: task.heartbeatSeconds ?? DEFAULT_HEARTBEAT_SECONDS,
        expireInSeconds: task.expireInSeconds,
        deadLetter: FAILED_RUNS_QUEUE,
      },
      "exclusive",
    );
  }
}

function isQueueNotFound(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === QUEUE_NOT_FOUND
  );
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
