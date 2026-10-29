import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { EndedRun } from "../_common/messaging/runs.js";
import {
  formatRebuildSearchIndexRunCompleted,
  formatRecalculatePrioritiesRunCompleted,
  formatReprocessCaptionsRunCompleted,
  formatTaskRunFailed,
} from "./task-run-messages.js";

// ---- Factory ----------------------------------------------------------------

function endedRun({
  task = "recalculate-priorities",
  ranForMs = 92_000,
} = {}): EndedRun {
  const startedAt = new Date("2026-10-25T10:00:00Z");
  return {
    task,
    runId: "run-1",
    requestedAt: new Date("2026-10-25T09:59:58Z"),
    startedAt,
    endedAt: new Date(startedAt.getTime() + ranForMs),
  };
}

// ---- Tests ------------------------------------------------------------------

describe("formatRecalculatePrioritiesRunCompleted()", () => {
  it("reports the channel counts", () => {
    const run = { ...endedRun(), output: { total: 440, failed: 2 } };

    assert.equal(
      formatRecalculatePrioritiesRunCompleted(run),
      "recalculate-priorities run run-1 completed in 1m 32s. Recalculated 438 of 440 channels, 2 failed.",
    );
  });
});

describe("formatReprocessCaptionsRunCompleted()", () => {
  it("reports the counts and no video ids", () => {
    const run = {
      ...endedRun({
        task: "reprocess-captions",
        ranForMs: (90 * 60 + 12) * 1000,
      }),
      output: {
        processedCount: 57_990,
        failedCount: 10,
        bothValidBefore: 41_200,
        bothValidAfter: 41_203,
        becameValid: [
          "aaaaaaaaaaa",
          "bbbbbbbbbbb",
          "ccccccccccc",
          "ddddddddddd",
        ],
        becameInvalid: ["eeeeeeeeeee"],
      },
    };

    assert.equal(
      formatReprocessCaptionsRunCompleted(run),
      "reprocess-captions run run-1 completed in 1h 30m.\n" +
        "Processed 57990, failed 10.\n" +
        "Both valid before 41200, after 41203.\n" +
        "Became valid 4, became invalid 1.",
    );
  });
});

describe("formatRebuildSearchIndexRunCompleted()", () => {
  it("reports the captions indexed and both index sizes", () => {
    const run = {
      ...endedRun({
        task: "rebuild-search-index",
        ranForMs: (62 * 60 + 5) * 1000,
      }),
      output: {
        indexed: 8_204_311,
        oldIndexSize: 8_150_002,
        newIndexSize: 8_204_311,
      },
    };

    assert.equal(
      formatRebuildSearchIndexRunCompleted(run),
      "rebuild-search-index run run-1 completed in 1h 2m. Indexed 8,204,311 captions. The old index held 8,150,002, the new one holds 8,204,311.",
    );
  });

  it("reports a rebuild that had no old index to replace", () => {
    const run = {
      ...endedRun({ task: "rebuild-search-index" }),
      output: { indexed: 120, oldIndexSize: null, newIndexSize: 120 },
    };

    assert.equal(
      formatRebuildSearchIndexRunCompleted(run),
      "rebuild-search-index run run-1 completed in 1m 32s. Indexed 120 captions. There was no old index, the new one holds 120.",
    );
  });
});

describe("formatTaskRunFailed()", () => {
  it("reports a run whose handler failed with the error", () => {
    const run = {
      ...endedRun({ ranForMs: 5_400 }),
      error: { type: "HANDLER_FAILED", message: "connection refused" } as const,
    };

    assert.equal(
      formatTaskRunFailed(run),
      "recalculate-priorities run run-1 failed after 5s: connection refused",
    );
  });

  it("reports a run whose worker died as the worker stopping responding", () => {
    const run = {
      ...endedRun({ ranForMs: (2 * 60 * 60 + 5 * 60 + 9) * 1000 }),
      error: { type: "WORKER_STOPPED_RESPONDING" } as const,
    };

    assert.equal(
      formatTaskRunFailed(run),
      "recalculate-priorities run run-1 failed after 2h 5m: its worker stopped responding.",
    );
  });

  it("reports a run that timed out as running past its time limit", () => {
    const run = { ...endedRun(), error: { type: "TIMED_OUT" } as const };

    assert.equal(
      formatTaskRunFailed(run),
      "recalculate-priorities run run-1 failed after 1m 32s: it ran past its time limit.",
    );
  });

  it("reports a run whose worker shut down as such", () => {
    const run = { ...endedRun(), error: { type: "WORKER_SHUT_DOWN" } as const };

    assert.equal(
      formatTaskRunFailed(run),
      "recalculate-priorities run run-1 failed after 1m 32s: its worker shut down.",
    );
  });
});
