import { beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { newDb, DataType } from "pg-mem";
import { CamelCasePlugin, Kysely, PostgresDialect, sql } from "kysely";
import { Database } from "../../../../db/types.js";
import { DatabaseClient } from "../../../../db/client.js";
import { VideoEntriesQueue } from "./video-entries.queue.js";

// ---- In-memory DB setup -----------------------------------------------------

async function createTestDb() {
  const mem = newDb();

  mem.public.registerFunction({
    name: "gen_random_uuid",
    returns: DataType.uuid,
    implementation: () => crypto.randomUUID(),
  });

  const { Pool } = mem.adapters.createPg();
  const pool = new Pool();

  const origConnect = pool.connect.bind(pool);
  pool.connect = async () => {
    const client = await origConnect();
    const origQuery = client.query.bind(client);
    client.query = (config: any, values?: any[]) => {
      const normalize = (sql: string) => sql
        .replace(/\bfor\s+update\s+of\s+"[^"]+"/gi, "for update")
        .replace(/\bskip\s+locked\b/gi, "");
      if (typeof config === "string") {
        config = normalize(config);
      } else if (typeof config?.text === "string") {
        config = { ...config, text: normalize(config.text) };
      }
      return origQuery(config, values);
    };
    return client;
  };

  const db = new Kysely<Database>({ dialect: new PostgresDialect({ pool }), plugins: [new CamelCasePlugin()] });

  await db.schema.createTable("channels")
    .addColumn("id", "varchar(24)", c => c.primaryKey())
    .addColumn("name", "varchar", c => c.notNull())
    .addColumn("description", "varchar")
    .addColumn("avatar", "varchar")
    .addColumn("subscriberCount", "integer")
    .addColumn("viewCount", "integer", c => c.notNull())
    .addColumn("videoCount", "integer", c => c.notNull())
    .addColumn("countryCode", "varchar")
    .addColumn("isFamilySafe", "boolean", c => c.notNull())
    .addColumn("channelCreatedAt", "timestamp", c => c.notNull())
    .addColumn("username", "varchar", c => c.notNull())
    .addColumn("isArtist", "boolean", c => c.notNull())
    .addColumn("keywords", sql`varchar[]`, c => c.notNull())
    .addColumn("createdAt", "timestamp", c => c.notNull().defaultTo(sql`now()`))
    .addColumn("updatedAt", "timestamp", c => c.notNull().defaultTo(sql`now()`))
    .execute();

  await db.schema.createTable("videoEntries")
    .addColumn("id", "varchar(11)", c => c.primaryKey())
    .addColumn("channelId", "varchar(24)", c => c.notNull())
    .addColumn("availability", "varchar", c => c.notNull())
    .addColumn("createdAt", "timestamp", c => c.notNull().defaultTo(sql`now()`))
    .addColumn("updatedAt", "timestamp", c => c.notNull().defaultTo(sql`now()`))
    .execute();

  await db.schema.createTable("videoJobs")
    .addColumn("id", "uuid", c => c.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn("videoId", "varchar(11)", c => c.notNull())
    .addColumn("channelId", "varchar(24)", c => c.notNull())
    .addColumn("status", "varchar", c => c.notNull())
    .addColumn("skipCause", "varchar")
    .addColumn("statusUpdatedAt", "timestamp")
    .addColumn("createdAt", "timestamp", c => c.defaultTo(sql`now()`))
    .execute();

  await db.schema.createTable("channelProcessingStats")
    .addColumn("id", "varchar(36)", c => c.primaryKey())
    .addColumn("channelId", "varchar(24)", c => c.notNull().unique())
    .addColumn("totalProcessedCount", "integer", c => c.notNull().defaultTo(0))
    .addColumn("validCaptionsCount", "integer", c => c.notNull().defaultTo(0))
    .addColumn("createdAt", "timestamp", c => c.notNull().defaultTo(sql`now()`))
    .addColumn("updatedAt", "timestamp", c => c.notNull().defaultTo(sql`now()`))
    .execute();

  return db;
}

// ---- Fixtures ---------------------------------------------------------------

async function seedChannel(db: Kysely<Database>, channelId: string, videoId: string) {
  await db.insertInto("channels").values({
    id: channelId,
    name: channelId,
    viewCount: 0,
    videoCount: 0,
    isFamilySafe: true,
    channelCreatedAt: new Date(),
    username: channelId,
    isArtist: false,
    keywords: [],
  }).execute();
  await db.insertInto("videoEntries").values({ id: videoId, channelId, availability: "PUBLIC" }).execute();
  await db.insertInto("videoJobs").values({ id: crypto.randomUUID(), videoId, channelId, status: "PENDING", statusUpdatedAt: new Date() }).execute();
}

async function seedStats(db: Kysely<Database>, channelId: string, totalProcessedCount: number, validCaptionsCount: number) {
  await db.insertInto("channelProcessingStats").values({
    id: crypto.randomUUID(),
    channelId,
    totalProcessedCount,
    validCaptionsCount,
    createdAt: new Date(),
    updatedAt: new Date(),
  }).execute();
}

// ---- Tests ------------------------------------------------------------------

describe("VideoEntriesQueue", () => {
  let db: Kysely<Database>;
  let queue: VideoEntriesQueue;

  beforeEach(async () => {
    db = await createTestDb();
    queue = new VideoEntriesQueue(db as unknown as DatabaseClient);
  });

  describe("getNextEntry()", () => {
    it("prefers video from channel above the 10% caption rate threshold", async () => {
      await seedChannel(db, "channel-bad", "video-bad");
      await seedStats(db, "channel-bad", 100, 5); // 5% — deprioritized

      await seedChannel(db, "channel-good", "video-good");
      await seedStats(db, "channel-good", 100, 50); // 50% — normal

      const result = await queue.getNextEntry();

      assert.ok(result.ok);
      assert.equal(result.value?.channelId, "channel-good");
    });

    it("falls back to deprioritized channel when it is the only option", async () => {
      await seedChannel(db, "channel-bad", "video-bad");
      await seedStats(db, "channel-bad", 100, 5); // 5% — deprioritized

      const result = await queue.getNextEntry();

      assert.ok(result.ok);
      assert.equal(result.value?.channelId, "channel-bad");
    });

    it("does not deprioritize a channel with fewer than 100 processed videos", async () => {
      await seedChannel(db, "channel-new", "video-new");
      await seedStats(db, "channel-new", 50, 1); // 2% rate but only 50 processed — not penalized

      await seedChannel(db, "channel-bad", "video-bad");
      await seedStats(db, "channel-bad", 100, 5); // 5% rate with 100+ processed — deprioritized

      const result = await queue.getNextEntry();

      assert.ok(result.ok);
      assert.equal(result.value?.channelId, "channel-new");
    });

    it("does not deprioritize a channel with no stats record yet", async () => {
      await seedChannel(db, "channel-no-stats", "vid-no-stat");
      // no channelProcessingStats row — new channel

      await seedChannel(db, "channel-bad", "video-bad");
      await seedStats(db, "channel-bad", 100, 5); // deprioritized

      const result = await queue.getNextEntry();

      assert.ok(result.ok);
      assert.equal(result.value?.channelId, "channel-no-stats");
    });

    it("does not deprioritize a channel at exactly the 10% threshold", async () => {
      await seedChannel(db, "channel-threshold", "vid-thresh_");
      await seedStats(db, "channel-threshold", 100, 10); // exactly 10% — not deprioritized

      await seedChannel(db, "channel-bad", "video-bad");
      await seedStats(db, "channel-bad", 100, 5); // 5% — deprioritized

      const result = await queue.getNextEntry();

      assert.ok(result.ok);
      assert.equal(result.value?.channelId, "channel-threshold");
    });

    it("returns null when the queue is empty", async () => {
      const result = await queue.getNextEntry();

      assert.ok(result.ok);
      assert.equal(result.value, null);
    });
  });
});
