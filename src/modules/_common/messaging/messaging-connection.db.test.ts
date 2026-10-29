import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readTestServer } from "../../../db/testing/test-server.js";
import type { Logger } from "../logger/logger.js";
import { createLoggerMock } from "../logger/testing/logger-mock.js";
import { MessagingConnection } from "./messaging-connection.js";

describe("MessagingConnection.start()", () => {
  it("refuses to start on a database without the pg-boss schema", async () => {
    const { baseDatabase: _, ...server } = readTestServer();
    const messagingConnection = new MessagingConnection(
      createLoggerMock() as unknown as Logger,
      { connection: { ...server, database: "postgres" } },
    );

    await assert.rejects(messagingConnection.start(), /not installed/);
  });
});
