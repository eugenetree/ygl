import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { useTestDatabaseConnection } from "../../../db/testing/test-database.js";
import { readTestServer } from "../../../db/testing/test-server.js";
import type { Logger } from "../logger/logger.js";
import { createLoggerMock } from "../logger/testing/logger-mock.js";
import { defineTask } from "./task-definitions.js";
import { installTaskSchema, Tasks } from "./tasks.js";

// ---- Fixtures ---------------------------------------------------------------

const exampleTask = defineTask<{ input: string }, { echoed: string }>({
  name: "example",
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
      tasks: [exampleTask],
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
