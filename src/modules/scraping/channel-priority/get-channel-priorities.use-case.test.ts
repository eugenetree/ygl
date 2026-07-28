import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import { Kysely } from "kysely";
import { DatabaseClient } from "../../../db/client.js";
import { createTestDb, truncateAll } from "../../../db/test-db.js";
import { Database, VideoJobStatus } from "../../../db/types.js";
import { GetChannelPrioritiesUseCase } from "./get-channel-priorities.use-case.js";

let db: Kysely<Database>;
let useCase: GetChannelPrioritiesUseCase;

before(async () => {
  db = await createTestDb();
  useCase = new GetChannelPrioritiesUseCase(db as unknown as DatabaseClient);
});

after(async () => {
  await db.destroy();
});

beforeEach(async () => {
  await truncateAll(db);
});

async function seedChannel(
  id: string,
  options: { name?: string; scrapingScore?: number | null } = {},
): Promise<void> {
  await db
    .insertInto("channels")
    .values({
      id,
      name: options.name ?? id,
      viewCount: 0,
      videoCount: 0,
      isFamilySafe: true,
      channelCreatedAt: new Date("2020-01-01"),
      username: id.toLowerCase(),
      isArtist: false,
      keywords: [],
    })
    .execute();

  if (options.scrapingScore !== null && options.scrapingScore !== undefined) {
    await db
      .insertInto("channelPriorityScores")
      .values({
        channelId: id,
        scrapingScore: options.scrapingScore,
        searchScore: 0,
        components: {},
        calculatedAt: new Date(),
      })
      .execute();
  }
}

async function seedVideoJobs(
  channelId: string,
  statuses: VideoJobStatus[],
): Promise<void> {
  let index = 0;
  for (const status of statuses) {
    const videoId = `${channelId}-v${index++}`;
    await db
      .insertInto("videoEntries")
      .values({ id: videoId, channelId, availability: "PUBLIC" })
      .execute();
    await db
      .insertInto("videoJobs")
      .values({ videoId, channelId, status, priority: 0 })
      .execute();
  }
}

async function boostChannel(channelId: string): Promise<void> {
  await db.insertInto("boostedChannels").values({ channelId }).execute();
}

describe("GetChannelPrioritiesUseCase", () => {
  it("counts each video job status into its own bucket", async () => {
    await seedChannel("UC_counts", { scrapingScore: 10 });
    await seedVideoJobs("UC_counts", [
      "SUCCEEDED",
      "SUCCEEDED",
      "SUCCEEDED",
      "PENDING",
      "PENDING",
      "PROCESSING",
      "FAILED",
      "SKIPPED",
      "SKIPPED",
    ]);

    const result = await useCase.execute({ onlyActive: false, limit: 10 });

    assert.ok(result.ok);
    assert.equal(result.value.length, 1);
    assert.deepEqual(result.value[0], {
      channelId: "UC_counts",
      name: "UC_counts",
      scrapingScore: 10,
      isBoosted: false,
      total: 9,
      processed: 3,
      left: 3,
      failed: 1,
      skipped: 2,
    });
  });

  describe("onlyActive", () => {
    beforeEach(async () => {
      await seedChannel("UC_pending", { scrapingScore: 40 });
      await seedVideoJobs("UC_pending", ["SUCCEEDED", "PENDING"]);

      await seedChannel("UC_processing", { scrapingScore: 30 });
      await seedVideoJobs("UC_processing", ["SUCCEEDED", "PROCESSING"]);

      await seedChannel("UC_drained", { scrapingScore: 20 });
      await seedVideoJobs("UC_drained", ["SUCCEEDED", "SKIPPED", "FAILED"]);

      await seedChannel("UC_undiscovered", { scrapingScore: 500 });
    });

    it("keeps only channels with video jobs still to run", async () => {
      const result = await useCase.execute({ onlyActive: true, limit: 10 });

      assert.ok(result.ok);
      assert.deepEqual(
        result.value.map((c) => c.channelId),
        ["UC_pending", "UC_processing"],
      );
    });

    it("keeps drained and undiscovered channels when not filtering", async () => {
      const result = await useCase.execute({ onlyActive: false, limit: 10 });

      assert.ok(result.ok);
      assert.deepEqual(
        result.value.map((c) => c.channelId),
        ["UC_undiscovered", "UC_pending", "UC_processing", "UC_drained"],
      );
    });

    it("reports an undiscovered channel as having no video jobs at all", async () => {
      const result = await useCase.execute({ onlyActive: false, limit: 10 });

      assert.ok(result.ok);
      const undiscovered = result.value.find(
        (c) => c.channelId === "UC_undiscovered",
      );
      assert.deepEqual(
        {
          total: undiscovered?.total,
          processed: undiscovered?.processed,
          left: undiscovered?.left,
          failed: undiscovered?.failed,
          skipped: undiscovered?.skipped,
        },
        { total: 0, processed: 0, left: 0, failed: 0, skipped: 0 },
      );
    });
  });

  it("ranks by scraping score, highest first, and honours the limit", async () => {
    await seedChannel("UC_low", { scrapingScore: 5 });
    await seedChannel("UC_high", { scrapingScore: 900 });
    await seedChannel("UC_mid", { scrapingScore: 60 });

    const result = await useCase.execute({ onlyActive: false, limit: 2 });

    assert.ok(result.ok);
    assert.deepEqual(
      result.value.map((c) => c.channelId),
      ["UC_high", "UC_mid"],
    );
  });

  it("ranks a channel with no priority score row as zero rather than dropping it", async () => {
    await seedChannel("UC_scored", { scrapingScore: 15 });
    await seedChannel("UC_unscored", { scrapingScore: null });

    const result = await useCase.execute({ onlyActive: false, limit: 10 });

    assert.ok(result.ok);
    assert.deepEqual(
      result.value.map((c) => ({
        channelId: c.channelId,
        scrapingScore: c.scrapingScore,
      })),
      [
        { channelId: "UC_scored", scrapingScore: 15 },
        { channelId: "UC_unscored", scrapingScore: 0 },
      ],
    );
  });

  it("marks boosted channels", async () => {
    await seedChannel("UC_boosted", { scrapingScore: 505 });
    await boostChannel("UC_boosted");
    await seedChannel("UC_plain", { scrapingScore: 5 });

    const result = await useCase.execute({ onlyActive: false, limit: 10 });

    assert.ok(result.ok);
    assert.deepEqual(
      result.value.map((c) => ({
        channelId: c.channelId,
        isBoosted: c.isBoosted,
      })),
      [
        { channelId: "UC_boosted", isBoosted: true },
        { channelId: "UC_plain", isBoosted: false },
      ],
    );
  });
});
