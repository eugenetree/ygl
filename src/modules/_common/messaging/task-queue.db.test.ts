import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import path from "node:path";
import { afterEach, before, beforeEach, describe, it } from "node:test";
import { setTimeout as sleep } from "node:timers/promises";
import { z } from "zod";
import type { DatabaseConnectionConfig } from "../../../db/client.js";
import { useTestDatabaseConnection } from "../../../db/testing/test-database.js";
import { Failure, Success } from "../../../types/index.js";
import type { EventBus, EventDefinition } from "./event-bus.js";
import { TASK_RUN_FAILED } from "./failed-runs.js";
import {
  type RunCompleted,
  type RunFailed,
  runCompletedSchema,
} from "./runs.js";
import type { AnyTask, RunState } from "./task-queue.js";
import {
  type StartedMessaging,
  startMessaging,
} from "./testing/start-messaging.js";

// ---- Fixtures ---------------------------------------------------------------

const exampleTask = {
  name: "example",
  expireInSeconds: 60,
  heartbeatSeconds: 10,
  runCompleted: {
    name: "example-run-completed",
    schema: runCompletedSchema(z.object({ echoed: z.string() })),
  },
} satisfies AnyTask;

const expiringTask = {
  name: "expiring",
  expireInSeconds: 1,
  heartbeatSeconds: 10,
  runCompleted: {
    name: "expiring-run-completed",
    schema: runCompletedSchema(z.void()),
  },
} satisfies AnyTask;

function untilAborted(signal: AbortSignal): Promise<never> {
  return new Promise((_, reject) => {
    signal.addEventListener("abort", () => reject(new Error("aborted")));
  });
}

const otherTask = {
  name: "other",
  expireInSeconds: 60,
  runCompleted: {
    name: "other-run-completed",
    schema: runCompletedSchema(z.object({ done: z.boolean() })),
  },
} satisfies AnyTask;

const notSetUpTask = {
  name: "not-set-up",
  expireInSeconds: 60,
  runCompleted: {
    name: "not-set-up-run-completed",
    schema: runCompletedSchema(z.void()),
  },
} satisfies AnyTask;

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

/** Leaves each task's queue as a worker of it that has started once does. */
async function setUpTasks(
  connection: DatabaseConnectionConfig,
  tasks: readonly AnyTask[],
) {
  const worker = await startMessaging({ connection });
  for (const task of tasks) {
    await worker.taskQueue.work(task, async () => {
      throw new Error("Only here to set the task up");
    });
  }
  await worker.stop();
}

type RunEnded = { completed: RunCompleted<unknown> } | { failed: RunFailed };

/** Subscribes to the given completed events and to every failed run. */
async function listenForRunsEnded(
  eventBus: EventBus,
  completed: readonly EventDefinition<RunCompleted<unknown>>[],
) {
  const received: RunEnded[] = [];
  // A run can arrive while a later event is still being subscribed to, before
  // anyone asks for it, so `next` reads from its own position.
  let taken = 0;
  let arrived = () => {};
  const receive = async (ended: RunEnded) => {
    received.push(ended);
    arrived();
    return Success(undefined);
  };
  for (const event of completed) {
    await eventBus.subscribe(event, "test-listener", (run) =>
      receive({ completed: run }),
    );
  }
  await eventBus.subscribe(TASK_RUN_FAILED, "test-listener", (run) =>
    receive({ failed: run }),
  );

  return {
    async next(timeoutMs = 10_000): Promise<RunEnded> {
      const index = taken++;
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
      // A task's event schema doesn't survive JSON, so only its settings go.
      JSON.stringify({
        connection,
        task: {
          name: task.name,
          expireInSeconds: task.expireInSeconds,
          heartbeatSeconds: task.heartbeatSeconds,
          runCompleted: task.runCompleted.name,
        },
      }),
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

describe("TaskQueue", () => {
  const connection = useTestDatabaseConnection();
  let messaging: StartedMessaging;

  before(async () => {
    await setUpTasks(connection, [exampleTask, otherTask]);
  });

  beforeEach(async () => {
    messaging = await startMessaging({ connection });
  });

  afterEach(async () => {
    await messaging.stop();
  });

  describe("request()", () => {
    it("returns the id of the requested run", async () => {
      const result = await messaging.taskQueue.request(exampleTask);

      assert.ok(result.ok);
      assert.match(result.value, /^[0-9a-f-]{36}$/);
    });

    it("refuses a request for a task no worker has started", async () => {
      const result = await messaging.taskQueue.request(notSetUpTask);

      assert.deepEqual(result, {
        ok: false,
        error: { type: "TASK_NOT_SET_UP" },
      });
    });

    it("refuses a second request while the first run is queued", async () => {
      await messaging.taskQueue.request(exampleTask);

      const result = await messaging.taskQueue.request(exampleTask);

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
      await messaging.taskQueue.work(exampleTask, async () => {
        running.resolve();
        await release.promise;
        return Success({ echoed: "hello" });
      });
      await messaging.taskQueue.request(exampleTask);
      await running.promise;

      const result = await messaging.taskQueue.request(exampleTask);
      release.resolve();

      assert.deepEqual(result, {
        ok: false,
        error: { type: "TASK_ALREADY_RUNNING" },
      });
    });
  });

  describe("latestRuns()", () => {
    async function latestRunOf(task: AnyTask) {
      const result = await messaging.taskQueue.latestRuns([
        exampleTask,
        otherTask,
        notSetUpTask,
      ]);
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
      await messaging.taskQueue.request(exampleTask);

      assert.equal(await latestRunOf(otherTask), undefined);
    });

    it("reports nothing for a task no worker has started", async () => {
      assert.equal(await latestRunOf(notSetUpTask), undefined);
    });

    it("reports a run nobody works as queued", async () => {
      const requested = await messaging.taskQueue.request(exampleTask);
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
      await messaging.taskQueue.work(exampleTask, async () => {
        running.resolve();
        await release.promise;
        return Success({ echoed: "hello" });
      });
      await messaging.taskQueue.request(exampleTask);
      await running.promise;

      const run = await latestRunOf(exampleTask);
      release.resolve();

      assert.equal(run?.state, "running");
      assert.ok(run.startedAt && run.startedAt >= run.requestedAt);
      assert.equal(run.endedAt, null);
    });

    it("reports a completed run as completed, with when it ended", {
      timeout: 10_000,
    }, async () => {
      await messaging.taskQueue.work(exampleTask, async () =>
        Success({ echoed: "hello" }),
      );
      await messaging.taskQueue.request(exampleTask);

      const run = await waitForState(exampleTask, "completed");

      assert.ok(run.startedAt && run.endedAt && run.endedAt >= run.startedAt);
    });

    it("reports a failed run as failed, with when it ended", {
      timeout: 10_000,
    }, async () => {
      await messaging.taskQueue.work(exampleTask, async () =>
        Failure({ type: "BOOM" }),
      );
      await messaging.taskQueue.request(exampleTask);

      const run = await waitForState(exampleTask, "failed");

      assert.ok(run.endedAt);
    });

    it("reports the latest of a task's runs", { timeout: 10_000 }, async () => {
      await messaging.taskQueue.work(otherTask, async () =>
        Success({ done: true }),
      );
      await messaging.taskQueue.request(otherTask);
      await waitForState(otherTask, "completed");

      const latest = await messaging.taskQueue.request(otherTask);
      assert.ok(latest.ok);

      assert.equal((await latestRunOf(otherTask))?.runId, latest.value);
    });
  });
});

describe("Run events", () => {
  const connection = useTestDatabaseConnection();
  const completed = [exampleTask.runCompleted, expiringTask.runCompleted];
  const options = { connection, monitorIntervalSeconds: 1 };
  let messaging: StartedMessaging;

  before(async () => {
    await setUpTasks(connection, [exampleTask, expiringTask]);
  });

  beforeEach(async () => {
    messaging = await startMessaging(options);
  });

  afterEach(async () => {
    await messaging.stop();
  });

  it("reports a run whose handler succeeds as completed, with its output", {
    timeout: 15_000,
  }, async () => {
    const runsEnded = await listenForRunsEnded(messaging.eventBus, completed);
    await messaging.taskQueue.work(exampleTask, async () =>
      Success({ echoed: "hello" }),
    );
    const requested = await messaging.taskQueue.request(exampleTask);
    assert.ok(requested.ok);

    const ended = await runsEnded.next();

    assert.ok("completed" in ended);
    const run = ended.completed;
    assert.deepEqual(
      { task: run.task, runId: run.runId, output: run.output },
      { task: "example", runId: requested.value, output: { echoed: "hello" } },
    );
    assert.ok(run.requestedAt <= run.startedAt);
    assert.ok(run.startedAt <= run.endedAt);
  });

  it("reports a run whose handler fails once, as failed with the error", {
    timeout: 20_000,
  }, async () => {
    const runsEnded = await listenForRunsEnded(messaging.eventBus, completed);
    await messaging.taskQueue.work(exampleTask, async () =>
      Failure({ type: "DATABASE", error: new Error("connection refused") }),
    );
    const requested = await messaging.taskQueue.request(exampleTask);
    assert.ok(requested.ok);

    const ended = await runsEnded.next();
    await assert.rejects(runsEnded.next(5_000), /No run ended/);

    assert.ok("failed" in ended);
    const run = ended.failed;
    assert.equal(run.runId, requested.value);
    assert.deepEqual(run.error, {
      type: "HANDLER_FAILED",
      message: "DATABASE: connection refused",
    });
    assert.ok(run.startedAt <= run.endedAt);
  });

  it("reports a run whose handler throws once, as failed with the error", {
    timeout: 20_000,
  }, async () => {
    const runsEnded = await listenForRunsEnded(messaging.eventBus, completed);
    await messaging.taskQueue.work(exampleTask, async () => {
      throw new Error("boom");
    });
    const requested = await messaging.taskQueue.request(exampleTask);
    assert.ok(requested.ok);

    const ended = await runsEnded.next();
    await assert.rejects(runsEnded.next(5_000), /No run ended/);

    assert.ok("failed" in ended);
    const run = ended.failed;
    assert.equal(run.runId, requested.value);
    assert.deepEqual(run.error, { type: "HANDLER_FAILED", message: "boom" });
  });

  it("reports a run whose worker died as the worker stopping responding", {
    timeout: 40_000,
  }, async () => {
    const runsEnded = await listenForRunsEnded(messaging.eventBus, completed);
    const worker = startHangingWorker(connection, exampleTask);
    const requested = await messaging.taskQueue.request(exampleTask);
    assert.ok(requested.ok);
    await worker.started;

    worker.kill();
    const ended = await runsEnded.next(30_000);

    assert.ok("failed" in ended);
    const run = ended.failed;
    assert.equal(run.runId, requested.value);
    assert.deepEqual(run.error, { type: "WORKER_STOPPED_RESPONDING" });
    assert.ok(run.startedAt <= run.endedAt);
  });

  it("reports a run that outlives its expiry once, as timed out", {
    timeout: 20_000,
  }, async () => {
    const runsEnded = await listenForRunsEnded(messaging.eventBus, completed);
    await messaging.taskQueue.work(expiringTask, (signal) =>
      untilAborted(signal),
    );
    const requested = await messaging.taskQueue.request(expiringTask);
    assert.ok(requested.ok);

    const ended = await runsEnded.next();
    await assert.rejects(runsEnded.next(5_000), /No run ended/);

    assert.ok("failed" in ended);
    const run = ended.failed;
    assert.equal(run.runId, requested.value);
    assert.deepEqual(run.error, { type: "TIMED_OUT" });
  });

  it("reports a run whose worker shut down during it once, as shut down", {
    timeout: 30_000,
  }, async () => {
    const runsEnded = await listenForRunsEnded(messaging.eventBus, completed);
    const other = await startMessaging(options);
    const running = deferred();
    await other.taskQueue.work(exampleTask, (signal) => {
      running.resolve();
      return untilAborted(signal);
    });
    const requested = await messaging.taskQueue.request(exampleTask);
    assert.ok(requested.ok);
    await running.promise;

    await other.stop();
    const ended = await runsEnded.next();
    await assert.rejects(runsEnded.next(5_000), /No run ended/);

    assert.ok("failed" in ended);
    const run = ended.failed;
    assert.equal(run.runId, requested.value);
    assert.deepEqual(run.error, { type: "WORKER_SHUT_DOWN" });
  });

  it("delivers a run that ended while its listener was down once it's back", {
    timeout: 20_000,
  }, async () => {
    const listener = await startMessaging(options);
    await listenForRunsEnded(listener.eventBus, completed);
    await listener.stop();
    const other = await startMessaging(options);
    const returned = deferred();
    await other.taskQueue.work(exampleTask, async () => {
      returned.resolve();
      return Success({ echoed: "hello" });
    });
    const requested = await messaging.taskQueue.request(exampleTask);
    assert.ok(requested.ok);
    await returned.promise;
    await other.stop();

    const runsEnded = await listenForRunsEnded(messaging.eventBus, completed);
    const ended = await runsEnded.next();

    assert.ok("completed" in ended);
    assert.equal(ended.completed.runId, requested.value);
  });
});
