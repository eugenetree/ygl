import type { JobWithMetadata, PgBoss } from "pg-boss";

import type { EventDefinition } from "./event-bus.js";
import { type RunError, type RunFailed, runFailedSchema } from "./runs.js";

/** Every task's failed runs, however they failed. */
export const TASK_RUN_FAILED = {
  name: "task-run-failed",
  schema: runFailedSchema,
} satisfies EventDefinition<RunFailed>;

/** pg-boss copies every run that fails here, whatever failed it. */
export const FAILED_RUNS_QUEUE = "task-failed-runs";

// A failed run whose relay fails, say while the database is unreachable, is
// relayed again later: 30 s, then doubling, for about two hours.
export const FAILED_RUNS_QUEUE_SETTINGS = {
  retryLimit: 8,
  retryDelay: 30,
  retryBackoff: true,
};

/**
 * Publishes every failed run as `TASK_RUN_FAILED`. Every process relays, so
 * a run whose worker died is relayed by whichever process is still up.
 */
export async function relayFailedRuns(boss: PgBoss): Promise<void> {
  await boss.work(
    FAILED_RUNS_QUEUE,
    { includeMetadata: true },
    async ([copy]) => {
      const run = await toRunFailed(boss, copy);
      if (run) {
        await boss.publish(TASK_RUN_FAILED.name, run);
      }
    },
  );
}

/** The run a copy in the failed runs queue was made of. */
async function toRunFailed(
  boss: PgBoss,
  copy: JobWithMetadata<unknown>,
): Promise<RunFailed | null> {
  if (copy.sourceName === null || copy.sourceId === null) {
    return null;
  }
  const [run] = await boss.findJobs(copy.sourceName, { id: copy.sourceId });
  return {
    task: copy.sourceName,
    runId: copy.sourceId,
    requestedAt: copy.sourceCreatedOn ?? copy.createdOn,
    // pg-boss deletes a run 7 days after it ends.
    startedAt: run?.startedOn ?? copy.createdOn,
    endedAt: run?.completedOn ?? copy.createdOn,
    error: toRunError(copy.sourceOutput),
  };
}

/** Why a failed run failed, from the output pg-boss stored for it. */
function toRunError(output: object | null): RunError {
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
  return { type: "HANDLER_FAILED", message };
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
