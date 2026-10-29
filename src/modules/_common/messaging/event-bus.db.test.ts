import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { setTimeout as sleep } from "node:timers/promises";
import { z } from "zod";
import { useTestDatabaseConnection } from "../../../db/testing/test-database.js";
import { Failure, Success } from "../../../types/index.js";
import { createLoggerMock } from "../logger/testing/logger-mock.js";
import type { EventDefinition } from "./event-bus.js";
import { startMessaging } from "./testing/start-messaging.js";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

async function waitForLoggedError(
  logger: ReturnType<typeof createLoggerMock>,
  includes: string,
  timeoutMs: number,
) {
  const logged = () =>
    logger.error.mock.calls
      .map((call) => call.arguments[0])
      .filter((entry) => entry.message?.includes(includes));
  const deadline = Date.now() + timeoutMs;
  while (logged().length === 0 && Date.now() < deadline) {
    await sleep(200);
  }
  return logged();
}

describe("EventBus", () => {
  const connection = useTestDatabaseConnection();
  const pinged = {
    name: "pinged",
    schema: z.object({ count: z.number() }),
  } satisfies EventDefinition<unknown>;
  const options = { connection };

  it("gives every consumer its own copy of an event", {
    timeout: 15_000,
  }, async () => {
    const messaging = await startMessaging(options);
    try {
      const first = deferred();
      const second = deferred();
      const received: string[] = [];
      await messaging.eventBus.subscribe(pinged, "first", async ({ count }) => {
        received.push(`first ${count}`);
        first.resolve();
        return Success(undefined);
      });
      await messaging.eventBus.subscribe(
        pinged,
        "second",
        async ({ count }) => {
          received.push(`second ${count}`);
          second.resolve();
          return Success(undefined);
        },
      );

      await messaging.eventBus.publish(pinged, { count: 1 });
      await Promise.all([first.promise, second.promise]);

      assert.deepEqual(received.sort(), ["first 1", "second 1"]);
    } finally {
      await messaging.stop();
    }
  });

  it("doesn't give a consumer what was published before it first subscribed", {
    timeout: 15_000,
  }, async () => {
    const messaging = await startMessaging(options);
    try {
      const received: number[] = [];
      const arrived = deferred();
      await messaging.eventBus.publish(pinged, { count: 1 });
      // Not one the other tests subscribe: a subscription outlives its test.
      await messaging.eventBus.subscribe(pinged, "late", async ({ count }) => {
        received.push(count);
        arrived.resolve();
        return Success(undefined);
      });

      await messaging.eventBus.publish(pinged, { count: 2 });
      await arrived.promise;

      assert.deepEqual(received, [2]);
    } finally {
      await messaging.stop();
    }
  });

  it("drops an event whose payload doesn't match it, logging an error", {
    timeout: 20_000,
  }, async () => {
    const logger = createLoggerMock();
    const messaging = await startMessaging(options, logger);
    try {
      let handled = 0;
      await messaging.eventBus.subscribe(pinged, "first", async () => {
        handled++;
        return Success(undefined);
      });

      await messaging.eventBus.publish(
        { name: pinged.name, schema: z.object({ total: z.number() }) },
        { total: 1 },
      );

      assert.equal(
        (await waitForLoggedError(logger, "Dropped", 10_000)).length,
        1,
      );
      assert.equal(handled, 0);
    } finally {
      await messaging.stop();
    }
  });

  it("logs an error naming the event once its handler has failed on every attempt", {
    timeout: 30_000,
  }, async () => {
    // A queue made with other retries, as a deploy before changing them leaves.
    const earlier = await startMessaging(options);
    await earlier.eventBus.subscribe(pinged, "first", async () =>
      Success(undefined),
    );
    await earlier.stop();
    const logger = createLoggerMock();
    const messaging = await startMessaging(
      {
        ...options,
        eventRetries: { retryLimit: 1, retryDelay: 1, retryBackoff: false },
      },
      logger,
    );
    try {
      let attempts = 0;
      await messaging.eventBus.subscribe(pinged, "first", async () => {
        attempts++;
        return Failure({ type: "TELEGRAM_UNREACHABLE" });
      });

      await messaging.eventBus.publish(pinged, { count: 7 });
      const gaveUp = await waitForLoggedError(logger, "Gave up", 20_000);

      assert.equal(attempts, 2);
      assert.equal(gaveUp.length, 1);
      assert.match(gaveUp[0].message ?? "", /pinged .* for first/);
    } finally {
      await messaging.stop();
    }
  });
});
