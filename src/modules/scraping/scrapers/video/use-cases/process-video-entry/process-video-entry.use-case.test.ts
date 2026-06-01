import { beforeEach, describe, it, mock } from "node:test";
import assert from "node:assert/strict";
import { Failure, Success } from "../../../../../../types/index.js";
import { ProcessVideoEntryUseCase } from "./process-video-entry.use-case.js";
import { Logger } from "../../../../../_common/logger/logger.js";
import { VideoMapper } from "./video.mapper.js";
import { VideoRepository } from "../../video.repository.js";
import { YoutubeApiGetVideo } from "../../../../../youtube-api/yt-api-get-video.js";
import { TranscriptionJobsQueue } from "../../transcription-jobs.queue.js";
import { CaptionAnalysisService } from "./caption-analysis.service.js";
import { Video } from "../../../../../youtube-api/youtube-api.types.js";
import { CaptionProps } from "../../caption.js";

// ---- Fixtures ---------------------------------------------------------------

const videoId = "video-1";
const channelId = "channel-1";
const videoInput = { videoId, channelId };

const baseVideoDto = {
  id: "video-1",
  channelId: "channel-1",
  title: "Test Video",
  duration: 120,
  keywords: [],
  viewCount: 1000,
  thumbnail: "https://thumb.jpg",
  languageCodeYtdlp: null,
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
  languageCode: "en",
  autoCaptions: { state: "FETCHED", data: [autoCaptionSegment] },
  manualCaptions: { state: "FETCHED", data: [manualCaptionSegment] },
};

const autoOnlyVideo: Video = {
  ...baseVideoDto,
  languageCode: "en",
  autoCaptions: { state: "PRESENT_NOT_FETCHED" },
  manualCaptions: { state: "ABSENT" },
};

const manualOnlyVideo: Video = {
  ...baseVideoDto,
  languageCode: null,
  autoCaptions: { state: "ABSENT" },
  manualCaptions: { state: "PRESENT_NOT_FETCHED" },
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
  languageCodeYtdlp: null,
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
    mocks.transcriptionJobsQueue as unknown as TranscriptionJobsQueue,
    mocks.captionAnalysisService as unknown as CaptionAnalysisService,
  );
}

function assertFailure<T extends { ok: boolean }>(result: T): asserts result is T & { ok: false } {
  assert.equal(result.ok, false);
}

// ---- Tests ------------------------------------------------------------------

describe("ProcessVideoEntryUseCase", () => {
  let mocks: ReturnType<typeof createMocks>;
  let sut: ProcessVideoEntryUseCase;

  beforeEach(() => {
    mocks = createMocks();

    // Happy-path defaults — individual tests override the one thing they care about
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

  describe("processVideo()", () => {
    it("returns failure when getVideo API fails", async () => {
      const ytError = { type: "YT_DLP_ERROR" as const, message: "yt-dlp died" };
      mocks.youtubeApiGetVideo.getVideo.mock.mockImplementation(() => Promise.resolve(Failure(ytError)));

      const result = await sut.execute(videoInput);

      assertFailure(result);
      assert.deepEqual(result.error, ytError);
    });

    it("persists metadata with empty caption arrays when manual status is CAPTIONS_MISSING_DURATIONS", async () => {
      mocks.captionAnalysisService.analyze.mock.mockImplementation(() => ({
        ...analysisResult,
        autoCaptionsStatus: "CAPTIONS_VALID" as const,
        manualCaptionsStatus: "CAPTIONS_MISSING_DURATIONS" as const,
      }));

      const result = await sut.execute(videoInput);

      assert.equal(result.ok, true);
      assert.equal(mocks.videoRepository.createWithCaptions.mock.callCount(), 1);
      const call = mocks.videoRepository.createWithCaptions.mock.calls[0]!.arguments[0];
      assert.deepEqual(call.autoCaptions, []);
      assert.deepEqual(call.manualCaptions, []);
      assert.equal(call.video.autoCaptionsStatus, "CAPTIONS_VALID");
      assert.equal(call.video.manualCaptionsStatus, "CAPTIONS_MISSING_DURATIONS");
      assert.equal(mocks.transcriptionJobsQueue.enqueue.mock.callCount(), 0);
      if (result.ok) assert.equal(result.value.hasValidCaptions, false);
    });

    it("persists non-empty caption arrays when both sides are CAPTIONS_TOO_SHORT", async () => {
      mocks.captionAnalysisService.analyze.mock.mockImplementation(() => ({
        ...analysisResult,
        autoCaptionsStatus: "CAPTIONS_TOO_SHORT" as const,
        manualCaptionsStatus: "CAPTIONS_TOO_SHORT" as const,
      }));

      const result = await sut.execute(videoInput);

      assert.equal(result.ok, true);
      assert.equal(mocks.videoRepository.createWithCaptions.mock.callCount(), 1);
      const call = mocks.videoRepository.createWithCaptions.mock.calls[0]!.arguments[0];
      assert.deepEqual(call.autoCaptions, autoCaptionProps);
      assert.deepEqual(call.manualCaptions, manualCaptionProps);
      if (result.ok) assert.equal(result.value.hasValidCaptions, false);
    });

    it("returns failure when createWithCaptions fails", async () => {
      mocks.videoRepository.createWithCaptions.mock.mockImplementation(() => Promise.resolve(Failure(dbError)));

      const result = await sut.execute(videoInput);

      assertFailure(result);
      assert.deepEqual(result.error, dbError);
    });

    it("enqueues a transcription job when only manual captions are present (manual PRESENT_NOT_FETCHED, auto ABSENT)", async () => {
      mocks.youtubeApiGetVideo.getVideo.mock.mockImplementation(() => Promise.resolve(Success(manualOnlyVideo)));

      await sut.execute(videoInput);

      assert.equal(mocks.transcriptionJobsQueue.enqueue.mock.callCount(), 1);
      assert.equal(mocks.transcriptionJobsQueue.enqueue.mock.calls[0]!.arguments[0], manualOnlyVideo.id);
    });

    it("does not enqueue a transcription job when only auto captions are present", async () => {
      mocks.youtubeApiGetVideo.getVideo.mock.mockImplementation(() => Promise.resolve(Success(autoOnlyVideo)));

      await sut.execute(videoInput);

      assert.equal(mocks.transcriptionJobsQueue.enqueue.mock.callCount(), 0);
    });

    it("does not enqueue a transcription job when both tracks are FETCHED", async () => {
      await sut.execute(videoInput);

      assert.equal(mocks.transcriptionJobsQueue.enqueue.mock.callCount(), 0);
    });

    it("returns failure when transcription enqueue fails", async () => {
      mocks.youtubeApiGetVideo.getVideo.mock.mockImplementation(() => Promise.resolve(Success(manualOnlyVideo)));
      mocks.transcriptionJobsQueue.enqueue.mock.mockImplementation(() => Promise.resolve(Failure(dbError)));

      const result = await sut.execute(videoInput);

      assertFailure(result);
      assert.deepEqual(result.error, dbError);
    });
  });

});
