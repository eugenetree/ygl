import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Kysely } from "kysely";
import { useTestDatabase } from "../../../../db/testing/test-database.js";
import type { Database } from "../../../../db/types.js";
import type { Logger } from "../../../_common/logger/logger.js";
import { createLoggerMock } from "../../../_common/logger/testing/logger-mock.js";
import { ChannelsQueue } from "./channels.queue.js";
import { VIDEOS_PER_CHANNEL_LIMIT } from "./config.js";

// ---- Fixtures ---------------------------------------------------------------

async function seedChannel(
  db: Kysely<Database>,
  channelId: string,
  overrides: { countryCode?: string | null; videoCount?: number } = {},
) {
  await db
    .insertInto("channels")
    .values({
      id: channelId,
      name: channelId,
      viewCount: 0,
      videoCount: overrides.videoCount ?? 0,
      countryCode:
        overrides.countryCode === undefined ? "US" : overrides.countryCode,
      isFamilySafe: true,
      channelCreatedAt: new Date(),
      username: channelId,
      isArtist: false,
      keywords: [],
    })
    .execute();
  await db
    .insertInto("videoDiscoveryJobs")
    .values({
      channelId,
      status: "PENDING",
      priority: 0,
      statusUpdatedAt: new Date(),
    })
    .execute();
}

async function boost(db: Kysely<Database>, channelId: string) {
  await db.insertInto("boostedChannels").values({ channelId }).execute();
}

// ---- Tests ------------------------------------------------------------------

describe("ChannelsQueue", () => {
  const db = useTestDatabase();
  const queue = new ChannelsQueue(createLoggerMock() as unknown as Logger, db);

  describe("getNextChannel()", () => {
    it("returns a channel from a supported country under the video limit", async () => {
      await seedChannel(db, "channel-ok");

      const result = await queue.getNextChannel();

      assert.ok(result.ok);
      assert.equal(result.value?.id, "channel-ok");
    });

    it("does not return a channel from an unsupported country", async () => {
      await seedChannel(db, "channel-de", { countryCode: "DE" });

      const result = await queue.getNextChannel();

      assert.ok(result.ok);
      assert.equal(result.value, null);
    });

    it("does not return a channel without a country", async () => {
      await seedChannel(db, "channel-none", { countryCode: null });

      const result = await queue.getNextChannel();

      assert.ok(result.ok);
      assert.equal(result.value, null);
    });

    it("does not return a channel at the video limit", async () => {
      await seedChannel(db, "channel-big", {
        videoCount: VIDEOS_PER_CHANNEL_LIMIT,
      });

      const result = await queue.getNextChannel();

      assert.ok(result.ok);
      assert.equal(result.value, null);
    });

    it("returns a boosted channel from an unsupported country", async () => {
      await seedChannel(db, "channel-de", { countryCode: "DE" });
      await boost(db, "channel-de");

      const result = await queue.getNextChannel();

      assert.ok(result.ok);
      assert.equal(result.value?.id, "channel-de");
    });

    it("returns a boosted channel without a country", async () => {
      await seedChannel(db, "channel-none", { countryCode: null });
      await boost(db, "channel-none");

      const result = await queue.getNextChannel();

      assert.ok(result.ok);
      assert.equal(result.value?.id, "channel-none");
    });

    it("returns a boosted channel at the video limit", async () => {
      await seedChannel(db, "channel-big", {
        videoCount: VIDEOS_PER_CHANNEL_LIMIT,
      });
      await boost(db, "channel-big");

      const result = await queue.getNextChannel();

      assert.ok(result.ok);
      assert.equal(result.value?.id, "channel-big");
    });
  });
});
