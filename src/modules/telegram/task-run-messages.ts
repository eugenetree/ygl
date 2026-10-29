import type {
  RebuildSearchIndexOutput,
  RecalculatePrioritiesOutput,
  ReprocessCaptionsOutput,
} from "../_common/messaging/definitions.js";
import type {
  EndedRun,
  RunCompleted,
  RunError,
  RunFailed,
} from "../_common/messaging/runs.js";
import { formatDuration } from "./format-duration.js";

export function formatRecalculatePrioritiesRunCompleted(
  run: RunCompleted<RecalculatePrioritiesOutput>,
): string {
  const { total, failed } = run.output;
  return `${completed(run)} Recalculated ${total - failed} of ${total} channels, ${failed} failed.`;
}

export function formatReprocessCaptionsRunCompleted(
  run: RunCompleted<ReprocessCaptionsOutput>,
): string {
  const { output } = run;
  return [
    completed(run),
    `Processed ${output.processedCount}, failed ${output.failedCount}.`,
    `Both valid before ${output.bothValidBefore}, after ${output.bothValidAfter}.`,
    `Became valid ${output.becameValid.length}, became invalid ${output.becameInvalid.length}.`,
  ].join("\n");
}

export function formatRebuildSearchIndexRunCompleted(
  run: RunCompleted<RebuildSearchIndexOutput>,
): string {
  const { indexed, oldIndexSize, newIndexSize } = run.output;
  const old =
    oldIndexSize === null
      ? "There was no old index"
      : `The old index held ${formatCount(oldIndexSize)}`;
  return `${completed(run)} Indexed ${formatCount(indexed)} captions. ${old}, the new one holds ${formatCount(newIndexSize)}.`;
}

export function formatTaskRunFailed(run: RunFailed): string {
  return `${runOf(run)} failed after ${took(run)}: ${describeError(run.error)}`;
}

export function formatCount(count: number): string {
  return count.toLocaleString("en-US");
}

function completed(run: EndedRun): string {
  return `${runOf(run)} completed in ${took(run)}.`;
}

function runOf(run: EndedRun): string {
  return `${run.task} run ${run.runId}`;
}

function took(run: EndedRun): string {
  return formatDuration(run.endedAt.getTime() - run.startedAt.getTime());
}

function describeError(error: RunError): string {
  switch (error.type) {
    case "HANDLER_FAILED":
      return error.message;
    case "WORKER_STOPPED_RESPONDING":
      return "its worker stopped responding.";
    case "TIMED_OUT":
      return "it ran past its time limit.";
    case "WORKER_SHUT_DOWN":
      return "its worker shut down.";
  }
}
