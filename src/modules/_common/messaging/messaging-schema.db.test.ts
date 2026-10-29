import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { z } from "zod";
import { useTestDatabaseConnection } from "../../../db/testing/test-database.js";
import { Success } from "../../../types/index.js";
import { installMessagingSchema } from "./messaging-schema.js";
import { runCompletedSchema } from "./runs.js";
import type { AnyTask } from "./task-queue.js";
import { startMessaging } from "./testing/start-messaging.js";

const exampleTask = {
  name: "example",
  expireInSeconds: 60,
  heartbeatSeconds: 10,
  runCompleted: {
    name: "example-run-completed",
    schema: runCompletedSchema(z.object({ echoed: z.string() })),
  },
} satisfies AnyTask;

describe("installMessagingSchema()", () => {
  const connection = useTestDatabaseConnection();

  it("leaves an installed schema working when run again", async () => {
    await installMessagingSchema(connection);

    const messaging = await startMessaging({ connection });
    await messaging.taskQueue.work(exampleTask, async () =>
      Success({ echoed: "hello" }),
    );
    const result = await messaging.taskQueue.request(exampleTask);
    await messaging.stop();

    assert.ok(result.ok);
  });
});
