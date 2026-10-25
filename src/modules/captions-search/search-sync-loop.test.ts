import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { setImmediate as settle } from "node:timers/promises";
import type { Logger } from "../_common/logger/logger.js";
import { createLoggerMock } from "../_common/logger/testing/logger-mock.js";
import { SearchSyncLoop } from "./search-sync-loop.js";
import type { SyncDataToElasticUseCase } from "./sync-data-to-elastic.use-case.js";

// ---- Factory ----------------------------------------------------------------

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

/** Records what ran, in order; every pass and piece of work waits to be let go. */
function buildSut() {
  const events: string[] = [];
  const passes: ReturnType<typeof deferred>[] = [];
  const syncUseCase = {
    execute: async () => {
      events.push("pass started");
      const pass = deferred();
      passes.push(pass);
      await pass.promise;
      events.push("pass ended");
      return { ok: true, value: { synced: 0 } };
    },
  };
  const loop = new SearchSyncLoop(
    syncUseCase as unknown as SyncDataToElasticUseCase,
    createLoggerMock() as unknown as Logger,
    { intervalMs: 60_000 },
  );
  return { loop, events, passes };
}

// ---- Tests ------------------------------------------------------------------

describe("SearchSyncLoop", () => {
  it("runs work queued during a pass once it ends, before the next pass", async () => {
    const { loop, events, passes } = buildSut();
    loop.start();
    await settle();
    const work = deferred();

    const done = loop.runBetweenPasses(async () => {
      events.push("work started");
      await work.promise;
      events.push("work ended");
      return "output";
    });
    await settle();
    assert.deepEqual(events, ["pass started"]);

    passes[0].resolve();
    await settle();
    await settle();
    assert.deepEqual(events, ["pass started", "pass ended", "work started"]);

    work.resolve();
    assert.equal(await done, "output");
    await settle();
    assert.deepEqual(events, [
      "pass started",
      "pass ended",
      "work started",
      "work ended",
      "pass started",
    ]);
    loop.stop();
    passes[1].resolve();
  });

  it("runs work queued while waiting for the next pass straight away", async () => {
    const { loop, events, passes } = buildSut();
    loop.start();
    await settle();
    passes[0].resolve();
    await settle();

    await loop.runBetweenPasses(async () => {
      events.push("work");
    });

    assert.deepEqual(events.slice(0, 3), [
      "pass started",
      "pass ended",
      "work",
    ]);
    loop.stop();
    await settle();
    passes[1].resolve();
  });

  it("passes on the failure of queued work and keeps passing", async () => {
    const { loop, events, passes } = buildSut();
    loop.start();
    await settle();
    passes[0].resolve();
    await settle();

    await assert.rejects(
      loop.runBetweenPasses(async () => {
        throw new Error("rebuild failed");
      }),
      /rebuild failed/,
    );
    await settle();

    assert.deepEqual(events, ["pass started", "pass ended", "pass started"]);
    loop.stop();
    passes[1].resolve();
  });
});
