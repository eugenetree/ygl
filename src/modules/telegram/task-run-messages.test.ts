import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { RunEnded, RunOutcome } from "../_common/tasks/tasks.js";
import { formatRunEnded } from "./task-run-messages.js";

// ---- Factory ----------------------------------------------------------------

function runEnded(
  outcome: RunOutcome,
  { task = "recalculate-priorities", ranForMs = 92_000 } = {},
): RunEnded {
  const startedAt = new Date("2026-10-25T10:00:00Z");
  return {
    task,
    runId: "run-1",
    requestedAt: new Date("2026-10-25T09:59:58Z"),
    startedAt,
    endedAt: new Date(startedAt.getTime() + ranForMs),
    ...outcome,
  };
}

// ---- Tests ------------------------------------------------------------------

describe("formatRunEnded()", () => {
  it("reports a completed priorities run with its channel counts", () => {
    const run = runEnded({
      outcome: "completed",
      output: { total: 440, failed: 2 },
    });

    assert.equal(
      formatRunEnded(run),
      "recalculate-priorities run run-1 completed in 1m 32s. Recalculated 438 of 440 channels, 2 failed.",
    );
  });

  it("reports a completed run of any other task with its duration", () => {
    const run = runEnded(
      { outcome: "completed", output: null },
      { task: "example" },
    );

    assert.equal(formatRunEnded(run), "example run run-1 completed in 1m 32s.");
  });

  it("reports a run whose handler threw with the error", () => {
    const run = runEnded(
      {
        outcome: "failed",
        error: { type: "HANDLER_THREW", message: "connection refused" },
      },
      { ranForMs: 5_400 },
    );

    assert.equal(
      formatRunEnded(run),
      "recalculate-priorities run run-1 failed after 5s: connection refused",
    );
  });

  it("reports a run whose worker died as the worker stopping responding", () => {
    const run = runEnded(
      { outcome: "failed", error: { type: "WORKER_STOPPED_RESPONDING" } },
      { ranForMs: (2 * 60 * 60 + 5 * 60 + 9) * 1000 },
    );

    assert.equal(
      formatRunEnded(run),
      "recalculate-priorities run run-1 failed after 2h 5m: its worker stopped responding.",
    );
  });

  it("reports a run that timed out as running past its time limit", () => {
    const run = runEnded({ outcome: "failed", error: { type: "TIMED_OUT" } });

    assert.equal(
      formatRunEnded(run),
      "recalculate-priorities run run-1 failed after 1m 32s: it ran past its time limit.",
    );
  });

  it("reports a run whose worker shut down as such", () => {
    const run = runEnded({
      outcome: "failed",
      error: { type: "WORKER_SHUT_DOWN" },
    });

    assert.equal(
      formatRunEnded(run),
      "recalculate-priorities run run-1 failed after 1m 32s: its worker shut down.",
    );
  });
});
