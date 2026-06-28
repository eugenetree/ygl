import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { CamelCasePlugin, Kysely, PostgresDialect, sql } from "kysely";
import { DataType, newDb } from "pg-mem";
import { DatabaseClient } from "../../../db/client.js";
import { Database } from "../../../db/types.js";
import { ChannelPriorityCalculator } from "./channel-priority.calculator.js";
import { ChannelPriorityService } from "./channel-priority.service.js";

async function createTestDb() {
  const mem = newDb();
  mem.public.registerFunction({
    name: "gen_random_uuid",
    returns: DataType.uuid,
    implementation: () => crypto.randomUUID(),
  });

  const { Pool } = mem.adapters.createPg();
  const pool = new Pool();

  const db = new Kysely<Database>({
    dialect: new PostgresDialect({ pool }),
    plugins: [new CamelCasePlugin()],
  });

  await db.schema
    .createTable("channels")
    .addColumn("id", "varchar", (c) => c.primaryKey())
    .addColumn("name", "varchar", (c) => c.notNull())
    .addColumn("subscriberCount", "integer")
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
    .createTable("videoJobs")
    .addColumn("id", "uuid", (c) =>
      c.primaryKey().defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn("videoId", "varchar", (c) => c.notNull())
    .addColumn("channelId", "varchar", (c) => c.notNull())
    .addColumn("status", "varchar", (c) => c.notNull())
    .addColumn("skipCause", "varchar")
    .addColumn("statusUpdatedAt", "timestamp")
    .addColumn("priority", "double precision", (c) => c.notNull().defaultTo(0))
    .addColumn("createdAt", "timestamp", (c) =>
      c.notNull().defaultTo(sql`now()`),
    )
    .execute();

  // boostedChannels needed by ChannelPriorityService constructor dependency
  await db.schema
    .createTable("boostedChannels")
    .addColumn("channelId", "varchar", (c) => c.primaryKey())
    .addColumn("createdAt", "timestamp", (c) =>
      c.notNull().defaultTo(sql`now()`),
    )
    .execute();

  return db;
}

function buildSut(db: Kysely<Database>) {
  return new ChannelPriorityService(
    db as unknown as DatabaseClient,
    new ChannelPriorityCalculator(),
  );
}

async function seedChannel(
  db: Kysely<Database>,
  id: string,
  name: string,
  subscriberCount: number | null = null,
) {
  await db
    .insertInto("channels")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .values({ id, name, subscriberCount } as any)
    .execute();
}

async function seedPriorityScore(
  db: Kysely<Database>,
  channelId: string,
  scrapingScore: number,
) {
  await db
    .insertInto("channelPriorityScores")
    .values({
      channelId,
      scrapingScore,
      searchScore: 0,
      components: JSON.stringify({}) as unknown as Record<string, unknown>,
      calculatedAt: new Date(),
    })
    .execute();
}

async function seedVideoJob(
  db: Kysely<Database>,
  channelId: string,
  videoId: string,
  status: "PENDING" | "PROCESSING" | "SUCCEEDED" | "FAILED",
) {
  await db
    .insertInto("videoJobs")
    .values({
      id: crypto.randomUUID(),
      channelId,
      videoId,
      status,
      priority: 0,
      statusUpdatedAt: new Date(),
    })
    .execute();
}

describe("ChannelPriorityService.getTopChannels", () => {
  let db: Kysely<Database>;
  let sut: ChannelPriorityService;

  beforeEach(async () => {
    db = await createTestDb();
    sut = buildSut(db);
  });

  afterEach(async () => {
    await db.destroy();
  });

  describe("activeOnly: false", () => {
    it("returns channels ordered by scrapingScore descending", async () => {
      await seedChannel(db, "ch-a", "Channel A");
      await seedChannel(db, "ch-b", "Channel B");
      await seedPriorityScore(db, "ch-a", 5.0);
      await seedPriorityScore(db, "ch-b", 9.0);

      const result = await sut.getTopChannels({ activeOnly: false });

      assert.ok(result.ok);
      assert.equal(result.value.length, 2);
      assert.equal(result.value[0].id, "ch-b");
      assert.equal(result.value[1].id, "ch-a");
    });

    it("excludes channels with no priority score", async () => {
      await seedChannel(db, "ranked", "Ranked");
      await seedChannel(db, "unranked", "Unranked");
      await seedPriorityScore(db, "ranked", 3.0);

      const result = await sut.getTopChannels({ activeOnly: false });

      assert.ok(result.ok);
      assert.equal(result.value.length, 1);
      assert.equal(result.value[0].id, "ranked");
    });

    it("returns correct processedCount and totalCount", async () => {
      await seedChannel(db, "ch-1", "Channel 1");
      await seedPriorityScore(db, "ch-1", 1.0);
      await seedVideoJob(db, "ch-1", "v1", "SUCCEEDED");
      await seedVideoJob(db, "ch-1", "v2", "SUCCEEDED");
      await seedVideoJob(db, "ch-1", "v3", "PENDING");

      const result = await sut.getTopChannels({ activeOnly: false });

      assert.ok(result.ok);
      const ch = result.value[0];
      assert.equal(ch.processedCount, 2);
      assert.equal(ch.totalCount, 3);
    });

    it("returns subscriberCount and name", async () => {
      await seedChannel(db, "ch-1", "My Channel", 500000);
      await seedPriorityScore(db, "ch-1", 1.0);

      const result = await sut.getTopChannels({ activeOnly: false });

      assert.ok(result.ok);
      assert.equal(result.value[0].name, "My Channel");
      assert.equal(result.value[0].subscriberCount, 500000);
    });

    it("limits results to 10", async () => {
      for (let i = 0; i < 15; i++) {
        await seedChannel(db, `ch-${i}`, `Channel ${i}`);
        await seedPriorityScore(db, `ch-${i}`, i);
      }

      const result = await sut.getTopChannels({ activeOnly: false });

      assert.ok(result.ok);
      assert.equal(result.value.length, 10);
    });

    it("returns zero counts for a channel with no video jobs", async () => {
      await seedChannel(db, "ch-empty", "Empty Channel");
      await seedPriorityScore(db, "ch-empty", 1.0);

      const result = await sut.getTopChannels({ activeOnly: false });

      assert.ok(result.ok);
      const ch = result.value[0];
      assert.equal(ch.processedCount, 0);
      assert.equal(ch.totalCount, 0);
    });
  });

  describe("activeOnly: true", () => {
    it("includes channels with at least one PENDING job", async () => {
      await seedChannel(db, "active", "Active Channel");
      await seedChannel(db, "done", "Done Channel");
      await seedPriorityScore(db, "active", 5.0);
      await seedPriorityScore(db, "done", 9.0);
      await seedVideoJob(db, "active", "v1", "PENDING");
      await seedVideoJob(db, "done", "v1", "SUCCEEDED");

      const result = await sut.getTopChannels({ activeOnly: true });

      assert.ok(result.ok);
      assert.equal(result.value.length, 1);
      assert.equal(result.value[0].id, "active");
    });

    it("includes channels with at least one PROCESSING job", async () => {
      await seedChannel(db, "ch-1", "Channel 1");
      await seedPriorityScore(db, "ch-1", 1.0);
      await seedVideoJob(db, "ch-1", "v1", "PROCESSING");

      const result = await sut.getTopChannels({ activeOnly: true });

      assert.ok(result.ok);
      assert.equal(result.value.length, 1);
    });

    it("excludes channels where all jobs are SUCCEEDED", async () => {
      await seedChannel(db, "ch-1", "Done Channel");
      await seedPriorityScore(db, "ch-1", 1.0);
      await seedVideoJob(db, "ch-1", "v1", "SUCCEEDED");
      await seedVideoJob(db, "ch-1", "v2", "SUCCEEDED");

      const result = await sut.getTopChannels({ activeOnly: true });

      assert.ok(result.ok);
      assert.equal(result.value.length, 0);
    });

    it("excludes channels with no video jobs at all", async () => {
      await seedChannel(db, "ch-1", "Empty Channel");
      await seedPriorityScore(db, "ch-1", 1.0);

      const result = await sut.getTopChannels({ activeOnly: true });

      assert.ok(result.ok);
      assert.equal(result.value.length, 0);
    });
  });
});
