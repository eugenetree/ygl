import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { setTimeout as sleep } from "node:timers/promises";
import type { DatabaseConnectionConfig } from "../../../db/client.js";
import { useTestDatabaseConnection } from "../../../db/testing/test-database.js";
import { readTestServer } from "../../../db/testing/test-server.js";
import type { Logger } from "../logger/logger.js";
import { createLoggerMock } from "../logger/testing/logger-mock.js";
import { type AnyTask, defineTask } from "./task-definitions.js";
import {
  installTaskSchema,
  type RunEnded,
  type RunState,
  Tasks,
} from "./tasks.js";

// ---- Fixtures ---------------------------------------------------------------

const exampleTask = defineTask<{ input: string }, { echoed: string }>({
  name: "example",
  expireInSeconds: 60,
  heartbeatSeconds: 10,
});

const expiringTask = defineTask<Record<string, never>, void>({
  name: "expiring",
  expireInSeconds: 1,
  heartbeatSeconds: 10,
});

function untilAborted(signal: AbortSignal): Promise<never> {
  return new Promise((_, reject) => {
    signal.addEventListener("abort", () => reject(new Error("aborted")));
  });
}

const otherTask = defineTask<Record<string, never>, object>({
  name: "other",
  expireInSeconds: 60,
});

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

async function listenForRunsEnded(tasks: Tasks) {
  const received: RunEnded[] = [];
  let arrived = () => {};
  await tasks.onRunEnded(async (run) => {
    received.push(run);
    arrived();
  });

  return {
    async next(timeoutMs = 10_000): Promise<RunEnded> {
      const index = received.length;
      const deadline = Date.now() + timeoutMs;
      while (received.length <= index) {
        const left = deadline - Date.now();
        if (left <= 0) {
          throw new Error(`No run ended within ${timeoutMs}ms`);
        }
        await new Promise<void>((resolve) => {
          const timer = setTimeout(resolve, left);
          arrived = () => {
            clearTimeout(timer);
            resolve();
          };
        });
      }
      return received[index];
    },
  };
}

/** A worker in its own process, which the test can kill while it holds a run. */
function startHangingWorker(
  connection: DatabaseConnectionConfig,
  task: AnyTask,
) {
  const worker = spawn(
    process.execPath,
    [
      "--import",
      "tsx",
      path.join(__dirname, "testing", "hanging-worker.ts"),
      JSON.stringify({ connection, task }),
    ],
    { stdio: ["ignore", "pipe", "inherit"] },
  );
  const started = new Promise<void>((resolve, reject) => {
    worker.stdout.on("data", (chunk) => {
      if (String(chunk).includes("started")) resolve();
    });
    worker.on("exit", (code) => {
      reject(new Error(`Worker exited with ${code}`));
    });
  });
  return { started, kill: () => worker.kill("SIGKILL") };
}

// ---- Tests ------------------------------------------------------------------

describe("Tasks", () => {
  const connection = useTestDatabaseConnection();
  let tasks: Tasks;

  beforeEach(async () => {
    tasks = new Tasks(createLoggerMock() as unknown as Logger, {
      connection,
      tasks: [exampleTask, otherTask],
    });
    await tasks.start();
  });

  afterEach(async () => {
    await tasks.stop();
  });

  describe("request()", () => {
    it("returns the id of the requested run", async () => {
      const result = await tasks.request(exampleTask, { input: "a" });

      assert.ok(result.ok);
      assert.match(result.value, /^[0-9a-f-]{36}$/);
    });

    it("refuses a second request while the first run is queued", async () => {
      await tasks.request(exampleTask, { input: "a" });

      const result = await tasks.request(exampleTask, { input: "b" });

      assert.deepEqual(result, {
        ok: false,
        error: { type: "TASK_ALREADY_RUNNING" },
      });
    });

    it("refuses a request while a run is running", {
      timeout: 10_000,
    }, async () => {
      const running = deferred();
      const release = deferred();
      await tasks.work(exampleTask, async ({ input }) => {
        running.resolve();
        await release.promise;
        return { echoed: input };
      });
      await tasks.request(exampleTask, { input: "a" });
      await running.promise;

      const result = await tasks.request(exampleTask, { input: "b" });
      release.resolve();

      assert.deepEqual(result, {
        ok: false,
        error: { type: "TASK_ALREADY_RUNNING" },
      });
    });
  });

  describe("work()", () => {
    it("hands the handler the data the run was requested with", {
      timeout: 10_000,
    }, async () => {
      let receive!: (data: { input: string }) => void;
      const received = new Promise<{ input: string }>((resolve) => {
        receive = resolve;
      });
      await tasks.work(exampleTask, async (data) => {
        receive(data);
        return { echoed: data.input };
      });

      await tasks.request(exampleTask, { input: "hello" });

      assert.deepEqual(await received, { input: "hello" });
    });
  });

  describe("latestRuns()", () => {
    async function latestRunOf(task: AnyTask) {
      const result = await tasks.latestRuns();
      assert.ok(result.ok);
      return result.value.find((run) => run.task === task.name);
    }

    async function waitForState(task: AnyTask, state: RunState) {
      for (;;) {
        const run = await latestRunOf(task);
        if (run?.state === state) {
          return run;
        }
        await sleep(100);
      }
    }

    it("reports nothing for a task without a run", async () => {
      await tasks.request(exampleTask, { input: "a" });

      assert.equal(await latestRunOf(otherTask), undefined);
    });

    it("reports a run nobody works as queued", async () => {
      const requested = await tasks.request(exampleTask, { input: "a" });
      assert.ok(requested.ok);

      const run = await latestRunOf(exampleTask);

      assert.ok(run);
      assert.deepEqual(
        { ...run, requestedAt: run.requestedAt instanceof Date },
        {
          task: "example",
          runId: requested.value,
          state: "queued",
          requestedAt: true,
          startedAt: null,
          endedAt: null,
        },
      );
    });

    it("reports a run being worked as running, with when it started", {
      timeout: 10_000,
    }, async () => {
      const running = deferred();
      const release = deferred();
      await tasks.work(exampleTask, async ({ input }) => {
        running.resolve();
        await release.promise;
        return { echoed: input };
      });
      await tasks.request(exampleTask, { input: "a" });
      await running.promise;

      const run = await latestRunOf(exampleTask);
      release.resolve();

      assert.equal(run?.state, "running");
      assert.ok(run.startedAt && run.startedAt >= run.requestedAt);
      assert.equal(run.endedAt, null);
    });

    it("reports a returned run as completed, with when it ended", {
      timeout: 10_000,
    }, async () => {
      await tasks.work(exampleTask, async ({ input }) => ({ echoed: input }));
      await tasks.request(exampleTask, { input: "a" });

      const run = await waitForState(exampleTask, "completed");

      assert.ok(run.startedAt && run.endedAt && run.endedAt >= run.startedAt);
    });

    it("reports a thrown run as failed, with when it ended", {
      timeout: 10_000,
    }, async () => {
      await tasks.work(exampleTask, async () => {
        throw new Error("boom");
      });
      await tasks.request(exampleTask, { input: "a" });

      const run = await waitForState(exampleTask, "failed");

      assert.ok(run.endedAt);
    });

    it("reports the latest of a task's runs", { timeout: 10_000 }, async () => {
      await tasks.work(otherTask, async () => ({}));
      await tasks.request(otherTask, {});
      await waitForState(otherTask, "completed");

      const latest = await tasks.request(otherTask, {});
      assert.ok(latest.ok);

      assert.equal((await latestRunOf(otherTask))?.runId, latest.value);
    });
  });
});

describe("Tasks.onRunEnded()", () => {
  const connection = useTestDatabaseConnection();
  let tasks: Tasks;

  async function startTasks(): Promise<Tasks> {
    const started = new Tasks(createLoggerMock() as unknown as Logger, {
      connection,
      tasks: [exampleTask, expiringTask],
      monitorIntervalSeconds: 1,
    });
    await started.start();
    return started;
  }

  beforeEach(async () => {
    tasks = await startTasks();
  });

  afterEach(async () => {
    await tasks.stop();
  });

  it("reports a run whose handler returns as completed, with its output", {
    timeout: 15_000,
  }, async () => {
    const runsEnded = await listenForRunsEnded(tasks);
    await tasks.work(exampleTask, async ({ input }) => ({ echoed: input }));
    const requested = await tasks.request(exampleTask, { input: "hello" });
    assert.ok(requested.ok);

    const run = await runsEnded.next();

    assert.ok(run.outcome === "completed");
    assert.deepEqual(
      { task: run.task, runId: run.runId, output: run.output },
      { task: "example", runId: requested.value, output: { echoed: "hello" } },
    );
    assert.ok(run.requestedAt <= run.startedAt);
    assert.ok(run.startedAt <= run.endedAt);
  });

  it("reports a run whose handler throws once, as failed with the error", {
    timeout: 20_000,
  }, async () => {
    const runsEnded = await listenForRunsEnded(tasks);
    await tasks.work(exampleTask, async () => {
      throw new Error("boom");
    });
    const requested = await tasks.request(exampleTask, { input: "a" });
    assert.ok(requested.ok);

    const run = await runsEnded.next();
    await assert.rejects(runsEnded.next(5_000), /No run ended/);

    assert.ok(run.outcome === "failed");
    assert.equal(run.runId, requested.value);
    assert.deepEqual(run.error, { type: "HANDLER_THREW", message: "boom" });
  });

  it("reports a run whose worker died as the worker stopping responding", {
    timeout: 40_000,
  }, async () => {
    const runsEnded = await listenForRunsEnded(tasks);
    const worker = startHangingWorker(connection, exampleTask);
    const requested = await tasks.request(exampleTask, { input: "a" });
    assert.ok(requested.ok);
    await worker.started;

    worker.kill();
    const run = await runsEnded.next(30_000);

    assert.ok(run.outcome === "failed");
    assert.equal(run.runId, requested.value);
    assert.deepEqual(run.error, { type: "WORKER_STOPPED_RESPONDING" });
    assert.ok(run.startedAt <= run.endedAt);
  });

  it("reports a run that outlives its expiry once, as timed out", {
    timeout: 20_000,
  }, async () => {
    const runsEnded = await listenForRunsEnded(tasks);
    await tasks.work(expiringTask, (_, signal) => untilAborted(signal));
    const requested = await tasks.request(expiringTask, {});
    assert.ok(requested.ok);

    const run = await runsEnded.next();
    await assert.rejects(runsEnded.next(5_000), /No run ended/);

    assert.ok(run.outcome === "failed");
    assert.equal(run.runId, requested.value);
    assert.deepEqual(run.error, { type: "TIMED_OUT" });
  });

  it("reports a run whose worker shut down during it once, as shut down", {
    timeout: 30_000,
  }, async () => {
    const runsEnded = await listenForRunsEnded(tasks);
    const worker = await startTasks();
    const running = deferred();
    await worker.work(exampleTask, (_, signal) => {
      running.resolve();
      return untilAborted(signal);
    });
    const requested = await tasks.request(exampleTask, { input: "a" });
    assert.ok(requested.ok);
    await running.promise;

    await worker.stop();
    const run = await runsEnded.next();
    await assert.rejects(runsEnded.next(5_000), /No run ended/);

    assert.ok(run.outcome === "failed");
    assert.equal(run.runId, requested.value);
    assert.deepEqual(run.error, { type: "WORKER_SHUT_DOWN" });
  });

  it("delivers a run that ended while nobody listened once someone does", {
    timeout: 20_000,
  }, async () => {
    const worker = await startTasks();
    const returned = deferred();
    await worker.work(exampleTask, async ({ input }) => {
      returned.resolve();
      return { echoed: input };
    });
    const requested = await tasks.request(exampleTask, { input: "a" });
    assert.ok(requested.ok);
    await returned.promise;
    await worker.stop();

    const runsEnded = await listenForRunsEnded(tasks);
    const run = await runsEnded.next();

    assert.ok(run.outcome === "completed");
    assert.equal(run.runId, requested.value);
  });
});

describe("Tasks.start()", () => {
  it("refuses to start on a database without the task schema", async () => {
    const { baseDatabase: _, ...server } = readTestServer();
    const tasks = new Tasks(createLoggerMock() as unknown as Logger, {
      connection: { ...server, database: "postgres" },
      tasks: [exampleTask],
    });

    await assert.rejects(tasks.start(), /not installed/);
  });
});

describe("installTaskSchema()", () => {
  const connection = useTestDatabaseConnection();

  it("leaves an installed schema working when run again", async () => {
    await installTaskSchema(connection);

    const tasks = new Tasks(createLoggerMock() as unknown as Logger, {
      connection,
      tasks: [exampleTask],
    });
    await tasks.start();
    const result = await tasks.request(exampleTask, { input: "a" });
    await tasks.stop();

    assert.ok(result.ok);
  });
});
