import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import type { Kysely } from "kysely";
import type { DatabaseClient } from "../../../db/client.js";
import { useTestDatabase } from "../../../db/testing/test-database.js";
import type { Database } from "../../../db/types.js";
import { ChannelPriorityCalculator } from "../channel-priority/channel-priority.calculator.js";
import { PRIORITY_MANUAL_BOOST } from "../channel-priority/channel-priority.constants.js";
import { ChannelPriorityService } from "../channel-priority/channel-priority.service.js";
import { ChannelEntriesQueue } from "../scrapers/channel/channel-entries.queue.js";
import { ChannelEntryRepository } from "../scrapers/channel-discovery/channel-entry.repository.js";
import { BoostedChannelsRepository } from "./boosted-channels.repository.js";
import { PushChannelUseCase } from "./push-channel.use-case.js";

// ---- SUT factory ------------------------------------------------------------

function buildSut(dbClient: DatabaseClient) {
  const calculator = new ChannelPriorityCalculator();
  const channelPriorityService = new ChannelPriorityService(
    dbClient,
    calculator,
  );
  const channelEntryRepository = new ChannelEntryRepository(dbClient);
  const channelEntriesQueue = new ChannelEntriesQueue(dbClient);
  const boostedChannelsRepository = new BoostedChannelsRepository(dbClient);
  return new PushChannelUseCase(
    channelPriorityService,
    channelEntryRepository,
    channelEntriesQueue,
    boostedChannelsRepository,
  );
}

// ---- Fixtures ---------------------------------------------------------------

async function seedChannelEntry(db: Kysely<Database>, channelId: string) {
  await db
    .insertInto("channelEntries")
    .values({ id: channelId, queryId: null })
    .execute();
}

async function seedChannel(db: Kysely<Database>, channelId: string) {
  await db
    .insertInto("channels")
    .values({
      id: channelId,
      name: channelId,
      viewCount: 0,
      videoCount: 0,
      isFamilySafe: true,
      channelCreatedAt: new Date(),
      username: channelId,
      isArtist: false,
      keywords: [],
    })
    .execute();
}

async function seedChannelJob(
  db: Kysely<Database>,
  channelId: string,
  status: "PENDING" | "SUCCEEDED" | "PROCESSING",
  priority = 0,
) {
  await db
    .insertInto("channelJobs")
    .values({ channelId, status, priority, statusUpdatedAt: new Date() })
    .execute();
}

async function seedVideoDiscoveryJob(
  db: Kysely<Database>,
  channelId: string,
  status: "PENDING" | "SUCCEEDED" | "PROCESSING",
  priority = 0,
) {
  await db
    .insertInto("videoDiscoveryJobs")
    .values({ channelId, status, priority, statusUpdatedAt: new Date() })
    .execute();
}

async function seedVideoJob(
  db: Kysely<Database>,
  channelId: string,
  videoId: string,
  status: "PENDING" | "SUCCEEDED" | "PROCESSING",
  priority = 0,
) {
  await db
    .insertInto("videoEntries")
    .values({ id: videoId, channelId, availability: "PUBLIC" })
    .execute();
  await db
    .insertInto("videoJobs")
    .values({
      id: crypto.randomUUID(),
      channelId,
      videoId,
      status,
      priority,
      statusUpdatedAt: new Date(),
    })
    .execute();
}

// ---- Tests ------------------------------------------------------------------

describe("PushChannelUseCase", () => {
  const db = useTestDatabase();
  const sut = buildSut(db);

  describe("new channel (not previously in scraping flow)", () => {
    it("returns ADDED status", async () => {
      const result = await sut.execute("new-channel-1");

      assert.ok(result.ok);
      assert.equal(result.value.status, "ADDED");
    });

    it("inserts into boostedChannels", async () => {
      await sut.execute("new-channel-1");

      const row = await db
        .selectFrom("boostedChannels")
        .selectAll()
        .where("channelId", "=", "new-channel-1")
        .executeTakeFirst();
      assert.ok(row);
    });

    it("inserts into channelEntries", async () => {
      await sut.execute("new-channel-1");

      const row = await db
        .selectFrom("channelEntries")
        .selectAll()
        .where("id", "=", "new-channel-1")
        .executeTakeFirst();
      assert.ok(row);
    });

    it("creates a PENDING channelJob boosted to PRIORITY_MANUAL_BOOST", async () => {
      await sut.execute("new-channel-1");

      const job = await db
        .selectFrom("channelJobs")
        .select(["status", "priority"])
        .where("channelId", "=", "new-channel-1")
        .executeTakeFirst();
      assert.ok(job);
      assert.equal(job.status, "PENDING");
      assert.equal(job.priority, PRIORITY_MANUAL_BOOST);
    });

    it("writes channelPriorityScores", async () => {
      await sut.execute("new-channel-1");

      const score = await db
        .selectFrom("channelPriorityScores")
        .select("scrapingScore")
        .where("channelId", "=", "new-channel-1")
        .executeTakeFirst();
      assert.ok(score);
      assert.equal(score.scrapingScore, PRIORITY_MANUAL_BOOST);
    });
  });

  describe("existing channel with a PENDING channelJob", () => {
    beforeEach(async () => {
      await seedChannelEntry(db, "channel-1");
      await seedChannelJob(db, "channel-1", "PENDING", 0);
    });

    it("returns PRIORITIZED with updatedChannelJobs=1", async () => {
      const result = await sut.execute("channel-1");

      assert.ok(result.ok);
      assert.equal(result.value.status, "PRIORITIZED");
      assert.equal((result.value as any).updatedChannelJobs, 1);
      assert.equal((result.value as any).updatedVideoDiscoveryJobs, 0);
      assert.equal((result.value as any).updatedVideoJobs, 0);
    });

    it("updates channelJob priority to PRIORITY_MANUAL_BOOST", async () => {
      await sut.execute("channel-1");

      const job = await db
        .selectFrom("channelJobs")
        .select("priority")
        .where("channelId", "=", "channel-1")
        .executeTakeFirst();
      assert.ok(job);
      assert.equal(job.priority, PRIORITY_MANUAL_BOOST);
    });
  });

  describe("existing channel with a PENDING videoDiscoveryJob", () => {
    beforeEach(async () => {
      await seedChannelEntry(db, "channel-1");
      await seedChannelJob(db, "channel-1", "SUCCEEDED");
      await seedChannel(db, "channel-1");
      await seedVideoDiscoveryJob(db, "channel-1", "PENDING", 0);
    });

    it("returns PRIORITIZED with updatedVideoDiscoveryJobs=1", async () => {
      const result = await sut.execute("channel-1");

      assert.ok(result.ok);
      assert.equal(result.value.status, "PRIORITIZED");
      assert.equal((result.value as any).updatedChannelJobs, 0);
      assert.equal((result.value as any).updatedVideoDiscoveryJobs, 1);
      assert.equal((result.value as any).updatedVideoJobs, 0);
    });

    it("updates videoDiscoveryJob priority to PRIORITY_MANUAL_BOOST", async () => {
      await sut.execute("channel-1");

      const job = await db
        .selectFrom("videoDiscoveryJobs")
        .select("priority")
        .where("channelId", "=", "channel-1")
        .executeTakeFirst();
      assert.ok(job);
      assert.equal(job.priority, PRIORITY_MANUAL_BOOST);
    });
  });

  describe("existing channel with PENDING videoJobs", () => {
    beforeEach(async () => {
      await seedChannelEntry(db, "channel-1");
      await seedChannelJob(db, "channel-1", "SUCCEEDED");
      await seedChannel(db, "channel-1");
      await seedVideoDiscoveryJob(db, "channel-1", "SUCCEEDED");
      await seedVideoJob(db, "channel-1", "video-1", "PENDING", 0);
      await seedVideoJob(db, "channel-1", "video-2", "PENDING", 0);
      await seedVideoJob(db, "channel-1", "video-3", "SUCCEEDED", 0);
    });

    it("returns PRIORITIZED with updatedVideoJobs equal to PENDING count only", async () => {
      const result = await sut.execute("channel-1");

      assert.ok(result.ok);
      assert.equal(result.value.status, "PRIORITIZED");
      assert.equal((result.value as any).updatedChannelJobs, 0);
      assert.equal((result.value as any).updatedVideoDiscoveryJobs, 0);
      assert.equal((result.value as any).updatedVideoJobs, 2);
    });

    it("updates only PENDING videoJob priorities, leaves SUCCEEDED unchanged", async () => {
      await sut.execute("channel-1");

      const jobs = await db
        .selectFrom("videoJobs")
        .select(["videoId", "status", "priority"])
        .where("channelId", "=", "channel-1")
        .execute();
      const pending = jobs.filter((j) => j.status === "PENDING");
      const succeeded = jobs.filter((j) => j.status === "SUCCEEDED");

      assert.ok(pending.every((j) => j.priority === PRIORITY_MANUAL_BOOST));
      assert.ok(succeeded.every((j) => j.priority === 0));
    });
  });

  describe("fully processed channel", () => {
    beforeEach(async () => {
      await seedChannelEntry(db, "channel-1");
      await seedChannelJob(db, "channel-1", "SUCCEEDED");
      await seedChannel(db, "channel-1");
      await seedVideoDiscoveryJob(db, "channel-1", "SUCCEEDED");
      await seedVideoJob(db, "channel-1", "video-1", "SUCCEEDED");
    });

    it("returns PRIORITIZED with all zeros", async () => {
      const result = await sut.execute("channel-1");

      assert.ok(result.ok);
      assert.equal(result.value.status, "PRIORITIZED");
      assert.equal((result.value as any).updatedChannelJobs, 0);
      assert.equal((result.value as any).updatedVideoDiscoveryJobs, 0);
      assert.equal((result.value as any).updatedVideoJobs, 0);
    });
  });

  describe("pushing the same channel twice", () => {
    it("second push returns PRIORITIZED (channel already exists after first push)", async () => {
      await sut.execute("new-channel-1");
      const result = await sut.execute("new-channel-1");

      assert.ok(result.ok);
      assert.equal(result.value.status, "PRIORITIZED");
    });

    it("boostedChannels insert is idempotent", async () => {
      await sut.execute("new-channel-1");
      await sut.execute("new-channel-1");

      const rows = await db
        .selectFrom("boostedChannels")
        .selectAll()
        .where("channelId", "=", "new-channel-1")
        .execute();
      assert.equal(rows.length, 1);
    });
  });
});
