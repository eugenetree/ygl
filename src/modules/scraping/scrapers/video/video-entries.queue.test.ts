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
    .addColumn("priority", "float8", c => c.notNull().defaultTo(0))
    .addColumn("createdAt", "timestamp", c => c.defaultTo(sql`now()`))
    .execute();

  return db;
}

// ---- Fixtures ---------------------------------------------------------------

async function seedChannel(db: Kysely<Database>, channelId: string, videoId: string, priority = 0) {
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
  await db.insertInto("videoJobs").values({ id: crypto.randomUUID(), videoId, channelId, status: "PENDING", priority, statusUpdatedAt: new Date() }).execute();
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
    it("returns the job with the highest priority first", async () => {
      await seedChannel(db, "channel-low", "video-low__", 1);
      await seedChannel(db, "channel-high", "video-high_", 10);

      const result = await queue.getNextEntry();

      assert.ok(result.ok);
      assert.equal(result.value?.channelId, "channel-high");
    });

    it("returns any available job when all priorities are equal", async () => {
      await seedChannel(db, "channel-a", "video-aaaa_", 5);
      await seedChannel(db, "channel-b", "video-bbbbb", 5);

      const result = await queue.getNextEntry();

      assert.ok(result.ok);
      assert.ok(result.value !== null);
    });

    it("returns null when the queue is empty", async () => {
      const result = await queue.getNextEntry();

      assert.ok(result.ok);
      assert.equal(result.value, null);
    });
  });
});
