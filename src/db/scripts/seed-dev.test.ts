import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CamelCasePlugin, Kysely, PostgresDialect, sql } from "kysely";
import { DataType, newDb } from "pg-mem";
import type { Database } from "../types.js";
import { seedDevFixtures } from "./seed-dev.js";

async function createTestDb(): Promise<Kysely<Database>> {
  const mem = newDb();

  mem.public.registerFunction({
    name: "gen_random_uuid",
    returns: DataType.uuid,
    implementation: () => crypto.randomUUID(),
  });

  const { Pool } = mem.adapters.createPg();
  const db = new Kysely<Database>({
    dialect: new PostgresDialect({ pool: new Pool() }),
    plugins: [new CamelCasePlugin()],
  });

  const ts = (col: any) => col.notNull().defaultTo(sql`now()`);

  await db.schema
    .createTable("searchChannelQueries")
    .addColumn("id", "uuid", (c) => c.primaryKey())
    .addColumn("query", "varchar", (c) => c.notNull())
    .addColumn("createdAt", "timestamp", ts)
    .addColumn("updatedAt", "timestamp", ts)
    .execute();

  await db.schema
    .createTable("channels")
    .addColumn("id", "varchar", (c) => c.primaryKey())
    .addColumn("name", "varchar", (c) => c.notNull())
    .addColumn("description", "varchar")
    .addColumn("avatar", "varchar")
    .addColumn("subscriberCount", "integer")
    .addColumn("viewCount", "integer", (c) => c.notNull())
    .addColumn("videoCount", "integer", (c) => c.notNull())
    .addColumn("countryCode", "varchar")
    .addColumn("isFamilySafe", "boolean", (c) => c.notNull())
    .addColumn("channelCreatedAt", "timestamp", (c) => c.notNull())
    .addColumn("username", "varchar", (c) => c.notNull())
    .addColumn("isArtist", "boolean", (c) => c.notNull())
    .addColumn("keywords", sql`varchar[]`, (c) => c.notNull())
    .addColumn("createdAt", "timestamp", ts)
    .addColumn("updatedAt", "timestamp", ts)
    .execute();

  await db.schema
    .createTable("channelDiscoveryJobs")
    .addColumn("id", "uuid", (c) => c.primaryKey())
    .addColumn("searchQueryId", "uuid", (c) => c.notNull())
    .addColumn("status", "varchar", (c) => c.notNull())
    .addColumn("statusUpdatedAt", "timestamp")
    .addColumn("createdAt", "timestamp", ts)
    .execute();

  await db.schema
    .createTable("channelEntries")
    .addColumn("id", "varchar", (c) => c.primaryKey())
    .addColumn("queryId", "uuid")
    .addColumn("createdAt", "timestamp", ts)
    .addColumn("updatedAt", "timestamp", ts)
    .execute();

  await db.schema
    .createTable("channelJobs")
    .addColumn("id", "uuid", (c) => c.primaryKey())
    .addColumn("channelId", "varchar", (c) => c.notNull())
    .addColumn("status", "varchar", (c) => c.notNull())
    .addColumn("statusUpdatedAt", "timestamp")
    .addColumn("priority", "double precision", (c) => c.notNull().defaultTo(0))
    .addColumn("createdAt", "timestamp", ts)
    .execute();

  await db.schema
    .createTable("videoDiscoveryJobs")
    .addColumn("id", "uuid", (c) => c.primaryKey())
    .addColumn("channelId", "varchar", (c) => c.notNull())
    .addColumn("status", "varchar", (c) => c.notNull())
    .addColumn("skipCause", "varchar")
    .addColumn("statusUpdatedAt", "timestamp")
    .addColumn("priority", "double precision", (c) => c.notNull().defaultTo(0))
    .addColumn("createdAt", "timestamp", ts)
    .execute();

  await db.schema
    .createTable("channelPriorityScores")
    .addColumn("channelId", "varchar", (c) => c.primaryKey())
    .addColumn("scrapingScore", "double precision", (c) => c.notNull())
    .addColumn("searchScore", "double precision", (c) => c.notNull())
    .addColumn("components", "jsonb", (c) => c.notNull())
    .addColumn("calculatedAt", "timestamp")
    .execute();

  await db.schema
    .createTable("videos")
    .addColumn("id", "varchar", (c) => c.primaryKey())
    .addColumn("channelId", "varchar", (c) => c.notNull())
    .addColumn("title", "varchar", (c) => c.notNull())
    .addColumn("duration", "integer", (c) => c.notNull())
    .addColumn("keywords", sql`varchar[]`, (c) => c.notNull())
    .addColumn("viewCount", "integer", (c) => c.notNull())
    .addColumn("thumbnail", "varchar", (c) => c.notNull())
    .addColumn("languageCode", "varchar")
    .addColumn("languageCodeYtdlp", "varchar")
    .addColumn("autoCaptionsStatus", "varchar", (c) => c.notNull())
    .addColumn("manualCaptionsStatus", "varchar", (c) => c.notNull())
    .addColumn("captionsSimilarityScore", "double precision")
    .addColumn("asr", "double precision")
    .addColumn("abr", "double precision")
    .addColumn("acodec", "varchar")
    .addColumn("audioChannels", "integer")
    .addColumn("audioQuality", "varchar")
    .addColumn("isDrc", "boolean")
    .addColumn("categories", sql`varchar[]`, (c) => c.notNull())
    .addColumn("track", "varchar")
    .addColumn("artist", "varchar")
    .addColumn("album", "varchar")
    .addColumn("creator", "varchar")
    .addColumn("captionsShift", "integer")
    .addColumn("captionsProcessingAlgorithmVersion", "varchar")
    .addColumn("uploadedAt", "timestamp")
    .addColumn("description", "varchar")
    .addColumn("likeCount", "integer")
    .addColumn("commentCount", "integer")
    .addColumn("availability", "varchar")
    .addColumn("playableInEmbed", "boolean")
    .addColumn("channelIsVerified", "boolean")
    .addColumn("liveStatus", "varchar")
    .addColumn("ageLimit", "integer")
    .addColumn("mediaType", "varchar")
    .addColumn("createdAt", "timestamp", ts)
    .addColumn("updatedAt", "timestamp", ts)
    .execute();

  await db.schema
    .createTable("videoEntries")
    .addColumn("id", "varchar", (c) => c.primaryKey())
    .addColumn("channelId", "varchar", (c) => c.notNull())
    .addColumn("availability", "varchar", (c) => c.notNull())
    .addColumn("createdAt", "timestamp", ts)
    .addColumn("updatedAt", "timestamp", ts)
    .execute();

  await db.schema
    .createTable("videoJobs")
    .addColumn("id", "uuid", (c) => c.primaryKey())
    .addColumn("videoId", "varchar", (c) => c.notNull())
    .addColumn("channelId", "varchar", (c) => c.notNull())
    .addColumn("status", "varchar", (c) => c.notNull())
    .addColumn("skipCause", "varchar")
    .addColumn("statusUpdatedAt", "timestamp")
    .addColumn("priority", "double precision", (c) => c.notNull().defaultTo(0))
    .addColumn("createdAt", "timestamp", ts)
    .execute();

  await db.schema
    .createTable("captions")
    .addColumn("id", "uuid", (c) => c.primaryKey())
    .addColumn("startTime", "integer", (c) => c.notNull())
    .addColumn("endTime", "integer", (c) => c.notNull())
    .addColumn("duration", "integer", (c) => c.notNull())
    .addColumn("text", "varchar", (c) => c.notNull())
    .addColumn("type", "varchar", (c) => c.notNull())
    .addColumn("videoId", "varchar", (c) => c.notNull())
    .addColumn("createdAt", "timestamp", ts)
    .addColumn("updatedAt", "timestamp", ts)
    .execute();

  return db;
}

async function countAll(db: Kysely<Database>) {
  const [scq, ch, cdj, ce, cj, vdj, cps, v, ve, vj, cap] = await Promise.all([
    db.selectFrom("searchChannelQueries").select(db.fn.countAll<number>().as("n")).executeTakeFirstOrThrow(),
    db.selectFrom("channels").select(db.fn.countAll<number>().as("n")).executeTakeFirstOrThrow(),
    db.selectFrom("channelDiscoveryJobs").select(db.fn.countAll<number>().as("n")).executeTakeFirstOrThrow(),
    db.selectFrom("channelEntries").select(db.fn.countAll<number>().as("n")).executeTakeFirstOrThrow(),
    db.selectFrom("channelJobs").select(db.fn.countAll<number>().as("n")).executeTakeFirstOrThrow(),
    db.selectFrom("videoDiscoveryJobs").select(db.fn.countAll<number>().as("n")).executeTakeFirstOrThrow(),
    db.selectFrom("channelPriorityScores").select(db.fn.countAll<number>().as("n")).executeTakeFirstOrThrow(),
    db.selectFrom("videos").select(db.fn.countAll<number>().as("n")).executeTakeFirstOrThrow(),
    db.selectFrom("videoEntries").select(db.fn.countAll<number>().as("n")).executeTakeFirstOrThrow(),
    db.selectFrom("videoJobs").select(db.fn.countAll<number>().as("n")).executeTakeFirstOrThrow(),
    db.selectFrom("captions").select(db.fn.countAll<number>().as("n")).executeTakeFirstOrThrow(),
  ]);
  return { scq: scq.n, ch: ch.n, cdj: cdj.n, ce: ce.n, cj: cj.n, vdj: vdj.n, cps: cps.n, v: v.n, ve: ve.n, vj: vj.n, cap: cap.n };
}

describe("seedDevFixtures idempotency", () => {
  it("running twice produces identical row counts", async () => {
    const db = await createTestDb();

    await seedDevFixtures(db);
    const after1 = await countAll(db);

    await seedDevFixtures(db);
    const after2 = await countAll(db);

    assert.deepEqual(after2, after1);
  });

  it("seeds the expected row counts on first run", async () => {
    const db = await createTestDb();
    await seedDevFixtures(db);
    const counts = await countAll(db);

    assert.equal(Number(counts.scq), 4,  "searchChannelQueries");
    assert.equal(Number(counts.ch),  10, "channels");
    assert.equal(Number(counts.cdj), 4,  "channelDiscoveryJobs");
    assert.equal(Number(counts.ce),  9,  "channelEntries");
    assert.equal(Number(counts.cj),  9,  "channelJobs");
    assert.equal(Number(counts.vdj), 9,  "videoDiscoveryJobs");
    assert.equal(Number(counts.cps), 8,  "channelPriorityScores");
    assert.equal(Number(counts.v),   10, "videos");
    assert.equal(Number(counts.ve),  10, "videoEntries");
    assert.equal(Number(counts.vj),  10, "videoJobs");
    assert.equal(Number(counts.cap), 40, "captions");
  });
});
