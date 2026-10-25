import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { setTimeout as sleep } from "node:timers/promises";
import { useTestDatabaseConnection } from "../../../db/testing/test-database.js";
import { readTestServer } from "../../../db/testing/test-server.js";
import type { Logger } from "../logger/logger.js";
import { createLoggerMock } from "../logger/testing/logger-mock.js";
import { type AnyTask, defineTask } from "./task-definitions.js";
import { installTaskSchema, type RunState, Tasks } from "./tasks.js";

// ---- Fixtures ---------------------------------------------------------------

const exampleTask = defineTask<{ input: string }, { echoed: string }>({
  name: "example",
  expireInSeconds: 60,
});

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
