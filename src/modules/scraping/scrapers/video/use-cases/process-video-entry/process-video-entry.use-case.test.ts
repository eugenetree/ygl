import { beforeEach, describe, it, mock } from "node:test";
import assert from "node:assert/strict";
import { Failure, Result, Success } from "../../../../../../types/index.js";
import { ProcessVideoEntryUseCase } from "./process-video-entry.use-case.js";
import { Logger } from "../../../../../_common/logger/logger.js";
import { VideoMapper } from "./video.mapper.js";
import { VideoRepository } from "../../video.repository.js";
import { YoutubeApiGetVideo } from "../../../../../youtube-api/yt-api-get-video.js";
import { ChannelVideoHealthRepository } from "../../channel-video-health.repository.js";
import { TranscriptionJobsQueue } from "../../transcription-jobs.queue.js";
import { CaptionAnalysisService } from "./caption-analysis.service.js";
import { MAX_FAILED_VIDEOS_STREAK } from "../../config.js";
import { ChannelVideosHealth } from "../../channel-videos-health.js";
import { Video } from "../../../../../youtube-api/youtube-api.types.js";
import { CaptionProps } from "../../caption.js";

// ---- Fixtures ---------------------------------------------------------------

const videoEntry = {
  id: "video-1",
  channelId: "channel-1",
};

const baseVideoDto = {
  id: "video-1",
  channelId: "channel-1",
  title: "Test Video",
  duration: 120,
  keywords: [],
  viewCount: 1000,
  thumbnail: "https://thumb.jpg",
  asr: null,
  abr: null,
  acodec: null,
  audioChannels: null,
  audioQuality: null,
  isDrc: null,
  categories: [],
  track: null,
  artist: null,
  album: null,
  creator: null,
  uploadedAt: null,
  description: null,
  likeCount: null,
  commentCount: null,
  availability: null,
  playableInEmbed: null,
  channelIsVerified: null,
  liveStatus: null,
  ageLimit: null,
  mediaType: null,
};

const autoCaptionSegment = { startTime: 0, endTime: 1, duration: 1, text: "hello" };
const manualCaptionSegment = { startTime: 0, endTime: 1, duration: 1, text: "hello" };

const bothVideo: Video = {
  ...baseVideoDto,
  captionStatus: "BOTH",
  languageCode: "en",
  autoCaptions: [autoCaptionSegment],
  manualCaptions: [manualCaptionSegment],
};

const autoOnlyVideo: Video = {
  ...baseVideoDto,
  captionStatus: "AUTO_ONLY",
  languageCode: "en",
  autoCaptions: [autoCaptionSegment],
  manualCaptions: null,
};

const manualOnlyVideo: Video = {
  ...baseVideoDto,
  captionStatus: "MANUAL_ONLY",
  languageCode: null,
  autoCaptions: null,
  manualCaptions: null,
};

const mappedVideoProps = {
  id: "video-1",
  channelId: "channel-1",
  title: "Test Video",
  duration: 120,
  keywords: [],
  viewCount: 1000,
  thumbnail: "https://thumb.jpg",
  languageCode: null,
  asr: null,
  abr: null,
  acodec: null,
  audioChannels: null,
  audioQuality: null,
  isDrc: null,
  categories: [],
  track: null,
  artist: null,
  album: null,
  creator: null,
  uploadedAt: null,
  description: null,
  likeCount: null,
  commentCount: null,
  availability: null,
  playableInEmbed: null,
  channelIsVerified: null,
  liveStatus: null,
  ageLimit: null,
  mediaType: null,
};

const analysisResult = {
  autoCaptionsStatus: "CAPTIONS_VALID" as const,
  manualCaptionsStatus: "CAPTIONS_VALID" as const,
  captionsSimilarityScore: 0.95,
  captionsShift: 0,
  captionsProcessingAlgorithmVersion: "test-version",
};

const autoCaptionProps: CaptionProps[] = [
  { startTime: 0, endTime: 1, duration: 1, text: "hello", type: "auto", videoId: "video-1" },
];

const manualCaptionProps: CaptionProps[] = [
  { startTime: 0, endTime: 1, duration: 1, text: "hello", type: "manual", videoId: "video-1" },
];

const existingHealthRecord: ChannelVideosHealth = {
  id: "health-1",
  channelId: "channel-1",
  succeededVideosStreak: 3,
  failedVideosStreak: 1,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const dbError = { type: "DATABASE" as const, error: new Error("db failure") };

// ---- Factory ----------------------------------------------------------------

function createMocks() {
  return {
    logger: {
      setContext: mock.fn<Logger["setContext"]>(),
      info: mock.fn<Logger["info"]>(),
      error: mock.fn<Logger["error"]>(),
      warn: mock.fn<Logger["warn"]>(),
    },
    videoMapper: {
      mapDtoToVideoProps: mock.fn<VideoMapper["mapDtoToVideoProps"]>(),
      mapDtoToCaptionProps: mock.fn<VideoMapper["mapDtoToCaptionProps"]>(),
    },
    videoRepository: {
      createWithCaptions: mock.fn<VideoRepository["createWithCaptions"]>(),
    },
    youtubeApiGetVideo: {
      getVideo: mock.fn<YoutubeApiGetVideo["getVideo"]>(),
    },
    channelVideosHealthRepository: {
      getHealthRecord: mock.fn<ChannelVideoHealthRepository["getHealthRecord"]>(),
      create: mock.fn<ChannelVideoHealthRepository["create"]>(),
      update: mock.fn<ChannelVideoHealthRepository["update"]>(),
    },
    transcriptionJobsQueue: {
      enqueue: mock.fn<TranscriptionJobsQueue["enqueue"]>(),
    },
    captionAnalysisService: {
      analyze: mock.fn<CaptionAnalysisService["analyze"]>(),
    },
  };
}

function buildSut(mocks: ReturnType<typeof createMocks>) {
  return new ProcessVideoEntryUseCase(
    mocks.logger as unknown as Logger,
    mocks.videoMapper as unknown as VideoMapper,
    mocks.videoRepository as unknown as VideoRepository,
    mocks.youtubeApiGetVideo as unknown as YoutubeApiGetVideo,
    mocks.channelVideosHealthRepository as unknown as ChannelVideoHealthRepository,
    mocks.transcriptionJobsQueue as unknown as TranscriptionJobsQueue,
    mocks.captionAnalysisService as unknown as CaptionAnalysisService,
  );
}

function assertFailure<V, E>(result: Result<V, E>): asserts result is Failure<E> {
  assert.equal(result.ok, false);
}

// ---- Tests ------------------------------------------------------------------

describe("ProcessVideoEntryUseCase", () => {
  let mocks: ReturnType<typeof createMocks>;
  let sut: ProcessVideoEntryUseCase;

  beforeEach(() => {
    mocks = createMocks();

    // Happy-path defaults — individual tests override the one thing they care about
    mocks.channelVideosHealthRepository.getHealthRecord.mock.mockImplementation(() => Promise.resolve(Success(null)));
    mocks.channelVideosHealthRepository.create.mock.mockImplementation(() => Promise.resolve(Success(undefined)));
    mocks.channelVideosHealthRepository.update.mock.mockImplementation(() => Promise.resolve(Success(undefined)));
    mocks.youtubeApiGetVideo.getVideo.mock.mockImplementation(() => Promise.resolve(Success(bothVideo)));
    mocks.videoMapper.mapDtoToVideoProps.mock.mockImplementation(() => mappedVideoProps);
    mocks.videoMapper.mapDtoToCaptionProps.mock.mockImplementation(
      ({ type }: { type: "auto" | "manual" }) => (type === "auto" ? autoCaptionProps : manualCaptionProps),
    );
    mocks.captionAnalysisService.analyze.mock.mockImplementation(() => analysisResult);
    mocks.videoRepository.createWithCaptions.mock.mockImplementation(() => Promise.resolve(Success(undefined)));
    mocks.transcriptionJobsQueue.enqueue.mock.mockImplementation(() => Promise.resolve(Success(undefined)));

    sut = buildSut(mocks);
  });

  describe("health record gate", () => {
    it("returns failure when getHealthRecord fails", async () => {
      mocks.channelVideosHealthRepository.getHealthRecord.mock.mockImplementation(() =>
        Promise.resolve(Failure(dbError)),
      );

      const result = await sut.execute(videoEntry);

      assertFailure(result);
      assert.deepEqual(result.error, dbError);
    });

    it("returns TOO_MANY_FAILED_VIDEOS when failedVideosStreak is at the limit", async () => {
      mocks.channelVideosHealthRepository.getHealthRecord.mock.mockImplementation(() =>
        Promise.resolve(Success({ ...existingHealthRecord, failedVideosStreak: MAX_FAILED_VIDEOS_STREAK })),
      );

      const result = await sut.execute(videoEntry);

      assertFailure(result);
      assert.equal(result.error.type, "TOO_MANY_FAILED_VIDEOS");
    });

    it("does not skip entry when failedVideosStreak is one below limit", async () => {
      mocks.channelVideosHealthRepository.getHealthRecord.mock.mockImplementation(() =>
        Promise.resolve(Success({ ...existingHealthRecord, failedVideosStreak: MAX_FAILED_VIDEOS_STREAK - 1 })),
      );

      const result = await sut.execute(videoEntry);

      assert.equal(result.ok, true);
    });

    it("does not skip entry when no health record exists", async () => {
      const result = await sut.execute(videoEntry);

      assert.equal(result.ok, true);
    });
  });

  describe("processVideo()", () => {
    it("returns failure when getVideo API fails", async () => {
      const ytError = { type: "YT_DLP_ERROR" as const, message: "yt-dlp died" };
      mocks.youtubeApiGetVideo.getVideo.mock.mockImplementation(() => Promise.resolve(Failure(ytError)));

      const result = await sut.execute(videoEntry);

      assertFailure(result);
      assert.deepEqual(result.error, ytError);
    });

    it("returns UNEXPECTED_STATE when manual captions exist without auto captions", async () => {
      // mapper returns empty for auto but non-empty for manual
      mocks.videoMapper.mapDtoToCaptionProps.mock.mockImplementation(
        ({ type }: { type: "auto" | "manual" }) => (type === "auto" ? [] : manualCaptionProps),
      );

      const result = await sut.execute(videoEntry);

      assertFailure(result);
      assert.equal(result.error.type, "UNEXPECTED_STATE");
    });

    it("returns failure when createWithCaptions fails", async () => {
      mocks.videoRepository.createWithCaptions.mock.mockImplementation(() => Promise.resolve(Failure(dbError)));

      const result = await sut.execute(videoEntry);

      assertFailure(result);
      assert.deepEqual(result.error, dbError);
    });

    it("enqueues a transcription job when captionStatus is MANUAL_ONLY", async () => {
      mocks.youtubeApiGetVideo.getVideo.mock.mockImplementation(() => Promise.resolve(Success(manualOnlyVideo)));

      await sut.execute(videoEntry);

      assert.equal(mocks.transcriptionJobsQueue.enqueue.mock.callCount(), 1);
      assert.equal(mocks.transcriptionJobsQueue.enqueue.mock.calls[0]!.arguments[0], manualOnlyVideo.id);
    });

    it("does not enqueue a transcription job when captionStatus is AUTO_ONLY", async () => {
      mocks.youtubeApiGetVideo.getVideo.mock.mockImplementation(() => Promise.resolve(Success(autoOnlyVideo)));

      await sut.execute(videoEntry);

      assert.equal(mocks.transcriptionJobsQueue.enqueue.mock.callCount(), 0);
    });

    it("does not enqueue a transcription job when captionStatus is BOTH", async () => {
      await sut.execute(videoEntry);

      assert.equal(mocks.transcriptionJobsQueue.enqueue.mock.callCount(), 0);
    });

    it("returns failure when transcription enqueue fails", async () => {
      mocks.youtubeApiGetVideo.getVideo.mock.mockImplementation(() => Promise.resolve(Success(manualOnlyVideo)));
      mocks.transcriptionJobsQueue.enqueue.mock.mockImplementation(() => Promise.resolve(Failure(dbError)));

      const result = await sut.execute(videoEntry);

      assertFailure(result);
      assert.deepEqual(result.error, dbError);
    });
  });

  describe("syncChannelHealth()", () => {
    it("calls create when no existing health record", async () => {
      await sut.execute(videoEntry);

      assert.equal(mocks.channelVideosHealthRepository.create.mock.callCount(), 1);
      assert.equal(mocks.channelVideosHealthRepository.update.mock.callCount(), 0);
    });

    it("calls update when health record already exists", async () => {
      mocks.channelVideosHealthRepository.getHealthRecord.mock.mockImplementation(() =>
        Promise.resolve(Success(existingHealthRecord)),
      );

      await sut.execute(videoEntry);

      assert.equal(mocks.channelVideosHealthRepository.update.mock.callCount(), 1);
      assert.equal(mocks.channelVideosHealthRepository.create.mock.callCount(), 0);
    });

    it("increments succeededVideosStreak and resets failedVideosStreak on success", async () => {
      mocks.channelVideosHealthRepository.getHealthRecord.mock.mockImplementation(() =>
        Promise.resolve(Success(existingHealthRecord)),
      );

      await sut.execute(videoEntry);

      const updated = mocks.channelVideosHealthRepository.update.mock.calls[0]!.arguments[0];
      assert.equal(updated.succeededVideosStreak, existingHealthRecord.succeededVideosStreak + 1);
      assert.equal(updated.failedVideosStreak, 0);
    });

    it("creates a new health record with succeededVideosStreak=1 when none exists", async () => {
      await sut.execute(videoEntry);

      const created = mocks.channelVideosHealthRepository.create.mock.calls[0]!.arguments[0];
      assert.equal(created.succeededVideosStreak, 1);
      assert.equal(created.failedVideosStreak, 0);
      assert.equal(created.channelId, videoEntry.channelId);
    });

    it("increments failedVideosStreak and resets succeededVideosStreak on processVideo failure", async () => {
      mocks.channelVideosHealthRepository.getHealthRecord.mock.mockImplementation(() =>
        Promise.resolve(Success(existingHealthRecord)),
      );
      mocks.youtubeApiGetVideo.getVideo.mock.mockImplementation(() =>
        Promise.resolve(Failure({ type: "YT_DLP_ERROR", message: "failed" })),
      );

      await sut.execute(videoEntry);

      const updated = mocks.channelVideosHealthRepository.update.mock.calls[0]!.arguments[0];
      assert.equal(updated.failedVideosStreak, existingHealthRecord.failedVideosStreak + 1);
      assert.equal(updated.succeededVideosStreak, 0);
    });

    it("creates health record with failedVideosStreak=1 when none exists and processing fails", async () => {
      mocks.youtubeApiGetVideo.getVideo.mock.mockImplementation(() =>
        Promise.resolve(Failure({ type: "YT_DLP_ERROR", message: "failed" })),
      );

      await sut.execute(videoEntry);

      const created = mocks.channelVideosHealthRepository.create.mock.calls[0]!.arguments[0];
      assert.equal(created.failedVideosStreak, 1);
      assert.equal(created.succeededVideosStreak, 0);
    });

    it("returns failure when health sync fails", async () => {
      mocks.channelVideosHealthRepository.create.mock.mockImplementation(() => Promise.resolve(Failure(dbError)));

      const result = await sut.execute(videoEntry);

      assertFailure(result);
    });
  });
});
