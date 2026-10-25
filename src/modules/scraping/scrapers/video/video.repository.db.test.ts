import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Kysely } from "kysely";
import { useTestDatabase } from "../../../../db/testing/test-database.js";
import type { Database } from "../../../../db/types.js";
import type { Logger } from "../../../_common/logger/logger.js";
import { createLoggerMock } from "../../../_common/logger/testing/logger-mock.js";
import { CAPTIONS_PROCESSING_ALGORITHM_VERSION } from "./config.js";
import { VideoRepository } from "./video.repository.js";

// ---- Fixtures ---------------------------------------------------------------

type SeededVideo = Partial<
  Pick<
    Database["videos"],
    | "autoCaptionsStatus"
    | "manualCaptionsStatus"
    | "captionsProcessingAlgorithmVersion"
  >
>;

async function seedVideo(
  db: Kysely<Database>,
  id: string,
  video: SeededVideo = {},
) {
  await db
    .insertInto("channels")
    .values({
      id: `UC-${id}`,
      name: id,
      viewCount: 0,
      videoCount: 0,
      isFamilySafe: true,
      channelCreatedAt: new Date(),
      username: id.toLowerCase(),
      isArtist: false,
      keywords: [],
    })
    .execute();
  await db
    .insertInto("videos")
    .values({
      id,
      title: id,
      channelId: `UC-${id}`,
      duration: 213,
      keywords: [],
      viewCount: 0,
      thumbnail: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
      autoCaptionsStatus: "CAPTIONS_VALID",
      manualCaptionsStatus: "CAPTIONS_VALID",
      categories: [],
      ...video,
    })
    .execute();
}

// ---- Tests ------------------------------------------------------------------

describe("VideoRepository", () => {
  const db = useTestDatabase();

  describe("countVideosForReprocessing()", () => {
    it("counts only the videos the reprocessing loop would still process", async () => {
      const repository = new VideoRepository(
        createLoggerMock() as unknown as Logger,
        db,
      );
      await seedVideo(db, "neverProcsd");
      await seedVideo(db, "olderVersin", {
        captionsProcessingAlgorithmVersion: "01/01/2020/1",
      });
      await seedVideo(db, "currentVers", {
        captionsProcessingAlgorithmVersion:
          CAPTIONS_PROCESSING_ALGORITHM_VERSION,
      });
      await seedVideo(db, "noAutoCapts", {
        autoCaptionsStatus: "CAPTIONS_ABSENT",
      });
      await seedVideo(db, "noManualCap", {
        manualCaptionsStatus: "CAPTIONS_ABSENT",
      });

      const count = await repository.countVideosForReprocessing();

      const loopVideoIds: string[] = [];
      for await (const result of repository.getVideosForReprocessing()) {
        assert.ok(result.ok);
        loopVideoIds.push(result.value.video.id);
      }
      assert.deepEqual(loopVideoIds, ["neverProcsd", "olderVersin"]);
      assert.deepEqual(count, { ok: true, value: 2 });
    });
  });
});
