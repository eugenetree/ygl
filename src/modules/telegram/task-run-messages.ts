import {
  type RecalculatePrioritiesOutput,
  recalculatePriorities,
} from "../_common/tasks/task-definitions.js";
import type { RunEnded, RunError } from "../_common/tasks/tasks.js";
import { formatDuration } from "./format-duration.js";

export function formatRunEnded(run: RunEnded): string {
  const took = formatDuration(run.endedAt.getTime() - run.startedAt.getTime());
  const prefix = `${run.task} run ${run.runId}`;

  if (run.outcome === "failed") {
    return `${prefix} failed after ${took}: ${describeError(run.error)}`;
  }

  const completed = `${prefix} completed in ${took}.`;
  switch (run.task) {
    case recalculatePriorities.name: {
      const { total, failed } = run.output as RecalculatePrioritiesOutput;
      return `${completed} Recalculated ${total - failed} of ${total} channels, ${failed} failed.`;
    }
    default:
      return completed;
  }
}

function describeError(error: RunError): string {
  switch (error.type) {
    case "HANDLER_THREW":
      return error.message;
    case "WORKER_STOPPED_RESPONDING":
      return "its worker stopped responding.";
    case "TIMED_OUT":
      return "it ran past its time limit.";
    case "WORKER_SHUT_DOWN":
      return "its worker shut down.";
  }
}
