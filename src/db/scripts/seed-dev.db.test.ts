import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Kysely } from "kysely";
import { useTestDatabase } from "../testing/test-database.js";
import type { Database } from "../types.js";
import { seedDevFixtures } from "./seed-dev.js";

async function countAll(db: Kysely<Database>) {
  const [scq, ch, cdj, ce, cj, vdj, cps, v, ve, vj, cap] = await Promise.all([
    db
      .selectFrom("searchChannelQueries")
      .select(db.fn.countAll<number>().as("n"))
      .executeTakeFirstOrThrow(),
    db
      .selectFrom("channels")
      .select(db.fn.countAll<number>().as("n"))
      .executeTakeFirstOrThrow(),
    db
      .selectFrom("channelDiscoveryJobs")
      .select(db.fn.countAll<number>().as("n"))
      .executeTakeFirstOrThrow(),
    db
      .selectFrom("channelEntries")
      .select(db.fn.countAll<number>().as("n"))
      .executeTakeFirstOrThrow(),
    db
      .selectFrom("channelJobs")
      .select(db.fn.countAll<number>().as("n"))
      .executeTakeFirstOrThrow(),
    db
      .selectFrom("videoDiscoveryJobs")
      .select(db.fn.countAll<number>().as("n"))
      .executeTakeFirstOrThrow(),
    db
      .selectFrom("channelPriorityScores")
      .select(db.fn.countAll<number>().as("n"))
      .executeTakeFirstOrThrow(),
    db
      .selectFrom("videos")
      .select(db.fn.countAll<number>().as("n"))
      .executeTakeFirstOrThrow(),
    db
      .selectFrom("videoEntries")
      .select(db.fn.countAll<number>().as("n"))
      .executeTakeFirstOrThrow(),
    db
      .selectFrom("videoJobs")
      .select(db.fn.countAll<number>().as("n"))
      .executeTakeFirstOrThrow(),
    db
      .selectFrom("captions")
      .select(db.fn.countAll<number>().as("n"))
      .executeTakeFirstOrThrow(),
  ]);
  return {
    scq: scq.n,
    ch: ch.n,
    cdj: cdj.n,
    ce: ce.n,
    cj: cj.n,
    vdj: vdj.n,
    cps: cps.n,
    v: v.n,
    ve: ve.n,
    vj: vj.n,
    cap: cap.n,
  };
}

describe("seedDevFixtures idempotency", () => {
  const db = useTestDatabase();

  it("running twice produces identical row counts", async () => {
    await seedDevFixtures(db);
    const after1 = await countAll(db);

    await seedDevFixtures(db);
    const after2 = await countAll(db);

    assert.deepEqual(after2, after1);
  });

  it("seeds the expected row counts on first run", async () => {
    await seedDevFixtures(db);
    const counts = await countAll(db);

    assert.equal(Number(counts.scq), 4, "searchChannelQueries");
    assert.equal(Number(counts.ch), 10, "channels");
    assert.equal(Number(counts.cdj), 4, "channelDiscoveryJobs");
    assert.equal(Number(counts.ce), 9, "channelEntries");
    assert.equal(Number(counts.cj), 9, "channelJobs");
    assert.equal(Number(counts.vdj), 9, "videoDiscoveryJobs");
    assert.equal(Number(counts.cps), 8, "channelPriorityScores");
    assert.equal(Number(counts.v), 10, "videos");
    assert.equal(Number(counts.ve), 10, "videoEntries");
    assert.equal(Number(counts.vj), 10, "videoJobs");
    assert.equal(Number(counts.cap), 40, "captions");
  });
});
