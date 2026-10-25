import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { LatestRun } from "../_common/tasks/tasks.js";
import { formatTasksOverview } from "./tasks-overview.js";

// ---- Fixtures ---------------------------------------------------------------

const now = new Date("2026-10-25T14:10:00Z");

function run(overrides: Partial<LatestRun>): LatestRun {
  return {
    task: "reprocess-captions",
    runId: "run-1",
    state: "queued",
    requestedAt: new Date("2026-10-25T14:00:00Z"),
    startedAt: null,
    endedAt: null,
    ...overrides,
  };
}

// ---- Tests ------------------------------------------------------------------

describe("formatTasksOverview()", () => {
  it("says a task without a run has none in the last 7 days", () => {
    const message = formatTasksOverview(
      [{ task: "recalculate-priorities", latestRun: undefined }],
      now,
    );

    assert.equal(message, "recalculate-priorities: no runs in the last 7 days");
  });

  it("shows how long a running run has been running", () => {
    const message = formatTasksOverview(
      [
        {
          task: "reprocess-captions",
          latestRun: run({
            state: "running",
            startedAt: new Date("2026-10-25T14:08:55Z"),
          }),
        },
      ],
      now,
    );

    assert.equal(
      message,
      "reprocess-captions: running for 1m 5s\n" +
        "Requested 2026-10-25 14:00 UTC",
    );
  });

  it("shows how long a completed run took", () => {
    const message = formatTasksOverview(
      [
        {
          task: "reprocess-captions",
          latestRun: run({
            state: "completed",
            startedAt: new Date("2026-10-25T09:00:00Z"),
            endedAt: new Date("2026-10-25T10:32:10Z"),
          }),
        },
      ],
      now,
    );

    assert.equal(
      message,
      "reprocess-captions: completed in 1h 32m\n" +
        "Requested 2026-10-25 14:00 UTC",
    );
  });

  it("shows how long a failed run ran", () => {
    const message = formatTasksOverview(
      [
        {
          task: "reprocess-captions",
          latestRun: run({
            state: "failed",
            startedAt: new Date("2026-10-25T14:00:10Z"),
            endedAt: new Date("2026-10-25T14:00:55Z"),
          }),
        },
      ],
      now,
    );

    assert.equal(
      message,
      "reprocess-captions: failed after 45s\n" +
        "Requested 2026-10-25 14:00 UTC",
    );
  });

  it("says a run that failed before starting just failed", () => {
    const message = formatTasksOverview(
      [
        {
          task: "reprocess-captions",
          latestRun: run({
            state: "failed",
            endedAt: new Date("2026-10-25T14:05:00Z"),
          }),
        },
      ],
      now,
    );

    assert.equal(
      message,
      "reprocess-captions: failed\nRequested 2026-10-25 14:00 UTC",
    );
  });

  it("shows a running run's progress", () => {
    const message = formatTasksOverview(
      [
        {
          task: "reprocess-captions",
          latestRun: run({
            state: "running",
            startedAt: new Date("2026-10-25T14:09:00Z"),
          }),
          progress: "12,345 videos left",
        },
      ],
      now,
    );

    assert.equal(
      message,
      "reprocess-captions: running for 1m 0s\n" +
        "Requested 2026-10-25 14:00 UTC\n" +
        "12,345 videos left",
    );
  });

  it("leaves out the progress of a run that isn't running", () => {
    const message = formatTasksOverview(
      [
        {
          task: "reprocess-captions",
          latestRun: run({ state: "queued" }),
          progress: "12,345 videos left",
        },
      ],
      now,
    );

    assert.equal(
      message,
      "reprocess-captions: queued\nRequested 2026-10-25 14:00 UTC",
    );
  });

  it("lists every task in the order given", () => {
    const message = formatTasksOverview(
      [
        { task: "reprocess-captions", latestRun: run({ state: "queued" }) },
        { task: "recalculate-priorities", latestRun: undefined },
      ],
      now,
    );

    assert.equal(
      message,
      "reprocess-captions: queued\n" +
        "Requested 2026-10-25 14:00 UTC\n\n" +
        "recalculate-priorities: no runs in the last 7 days",
    );
  });
});
