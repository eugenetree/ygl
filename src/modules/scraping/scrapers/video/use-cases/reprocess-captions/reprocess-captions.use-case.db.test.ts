import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";
import type { Kysely } from "kysely";
import type { DatabaseClient } from "../../../../../../db/client.js";
import { useTestDatabase } from "../../../../../../db/testing/test-database.js";
import type { Database } from "../../../../../../db/types.js";
import type { Logger } from "../../../../../_common/logger/logger.js";
import { createLoggerMock } from "../../../../../_common/logger/testing/logger-mock.js";
import { VideoRepository } from "../../video.repository.js";
import { AutoCaptionsValidator } from "../process-video-entry/auto-captions.validator.js";
import { CaptionAnalysisService } from "../process-video-entry/caption-analysis.service.js";
import { CaptionCleanUpService } from "../process-video-entry/caption-clean-up.service.js";
import { CaptionSimilarityService } from "../process-video-entry/captions-similarity.service.js";
import { ManualCaptionsValidator } from "../process-video-entry/manual-captions.validator.js";
import { ReprocessCaptionsUseCase } from "./reprocess-captions.use-case.js";

// ---- SUT factory ------------------------------------------------------------

function buildSut(db: DatabaseClient) {
  const logger = createLoggerMock() as unknown as Logger;
  const cleanUp = new CaptionCleanUpService();
  const captionAnalysisService = new CaptionAnalysisService(
    new ManualCaptionsValidator(logger, cleanUp),
    new AutoCaptionsValidator(logger, cleanUp),
    new CaptionSimilarityService(logger, cleanUp),
  );
  const videoRepository = new VideoRepository(logger, db);
  return {
    captionAnalysisService,
    videoRepository,
    useCase: new ReprocessCaptionsUseCase(
      logger,
      videoRepository,
      captionAnalysisService,
    ),
  };
}

// ---- Fixtures ---------------------------------------------------------------

async function seedVideo(db: Kysely<Database>, id: string) {
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
    })
    .execute();
}

async function seedVideos(db: Kysely<Database>) {
  await seedVideo(db, "video000001");
  await seedVideo(db, "video000002");
  await seedVideo(db, "video000003");
}

function abortOnFirstVideo(
  captionAnalysisService: CaptionAnalysisService,
): AbortSignal {
  const controller = new AbortController();
  const analyze = captionAnalysisService.analyze.bind(captionAnalysisService);
  mock.method(
    captionAnalysisService,
    "analyze",
    (...args: Parameters<typeof analyze>) => {
      controller.abort();
      return analyze(...args);
    },
  );
  return controller.signal;
}

// ---- Tests ------------------------------------------------------------------

describe("ReprocessCaptionsUseCase", () => {
  const db = useTestDatabase();

  it("stops at the next video once its signal fires", async () => {
    const { useCase, captionAnalysisService, videoRepository } = buildSut(db);
    await seedVideos(db);

    const result = await useCase.execute(
      abortOnFirstVideo(captionAnalysisService),
    );

    assert.ok(result.ok);
    assert.equal(result.value.processedCount, 1);
    assert.deepEqual(await videoRepository.countVideosForReprocessing(), {
      ok: true,
      value: 2,
    });
  });

  it("goes on from the videos a stopped run left", async () => {
    const { useCase, captionAnalysisService } = buildSut(db);
    await seedVideos(db);
    await useCase.execute(abortOnFirstVideo(captionAnalysisService));
    mock.restoreAll();

    const result = await useCase.execute(new AbortController().signal);

    assert.ok(result.ok);
    assert.equal(result.value.processedCount, 2);
  });
});
