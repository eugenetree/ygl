import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Kysely } from "kysely";
import { useTestDatabase } from "../../../../db/testing/test-database.js";
import type { Database } from "../../../../db/types.js";
import { VideoEntriesQueue } from "./video-entries.queue.js";

// ---- Fixtures ---------------------------------------------------------------

async function seedChannel(
  db: Kysely<Database>,
  channelId: string,
  videoId: string,
  priority = 0,
) {
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
  await db
    .insertInto("videoEntries")
    .values({ id: videoId, channelId, availability: "PUBLIC" })
    .execute();
  await db
    .insertInto("videoJobs")
    .values({
      id: crypto.randomUUID(),
      videoId,
      channelId,
      status: "PENDING",
      priority,
      statusUpdatedAt: new Date(),
    })
    .execute();
}

// ---- Tests ------------------------------------------------------------------

describe("VideoEntriesQueue", () => {
  const db = useTestDatabase();
  const queue = new VideoEntriesQueue(db);

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

    // getNextEntry() commits its own transaction, so contention can only be set
    // up from a second connection that holds a row lock while it runs.
    it("skips a job another worker has locked instead of waiting for it", async () => {
      await seedChannel(db, "channel-low", "video-low__", 1);
      await seedChannel(db, "channel-high", "video-high_", 10);

      const result = await db.transaction().execute(async (trx) => {
        await trx
          .selectFrom("videoJobs")
          .select("id")
          .where("videoId", "=", "video-high_")
          .forUpdate()
          .executeTakeFirstOrThrow();
        return queue.getNextEntry();
      });

      assert.ok(result.ok, "getNextEntry() waited on the locked job");
      assert.equal(result.value?.id, "video-low__");
    });
  });
});
