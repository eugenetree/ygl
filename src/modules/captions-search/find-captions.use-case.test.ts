import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";
import { Failure, Success } from "../../types/index.js";
import type { Logger } from "../_common/logger/logger.js";
import { createLoggerMock } from "../_common/logger/testing/logger-mock.js";
import type {
  CaptionSearchResult,
  CaptionsService,
  StoredCaption,
} from "./captions.service.js";
import type { ClipVideo } from "./clip.js";
import type { ClipVideoRepository } from "./clip-video.repository.js";
import { FindCaptionsUseCase } from "./find-captions.use-case.js";

// ---- Fixtures ---------------------------------------------------------------

const caption = (overrides: Partial<StoredCaption> = {}): StoredCaption => ({
  id: "caption-1",
  videoId: "video-1",
  startTime: 2500,
  endTime: 4200,
  text: "never gonna give you up",
  ...overrides,
});

const video = (overrides: Partial<ClipVideo> = {}): ClipVideo => ({
  id: "video-1",
  title: "Never Gonna Give You Up",
  channel: { name: "Rick Astley" },
  ...overrides,
});

const found = (
  captions: StoredCaption[],
  total = captions.length,
  isTotalExact = true,
) => Success<CaptionSearchResult>({ captions, total, isTotalExact });

const videosById = (...videos: ClipVideo[]) =>
  Success(new Map(videos.map((v) => [v.id, v])));

const PAGE = { offset: 0, limit: 20 };

// ---- Factory ----------------------------------------------------------------

function createMocks(
  search: CaptionsService["search"] = async () => found([caption()]),
  findByIds: ClipVideoRepository["findByIds"] = async () => videosById(video()),
) {
  return {
    logger: createLoggerMock(),
    captionsService: { search: mock.fn(search) },
    clipVideoRepository: { findByIds: mock.fn(findByIds) },
  };
}

function buildSut(mocks: ReturnType<typeof createMocks>) {
  return new FindCaptionsUseCase(
    mocks.logger as unknown as Logger,
    mocks.captionsService as unknown as CaptionsService,
    mocks.clipVideoRepository as unknown as ClipVideoRepository,
  );
}

// ---- Tests ------------------------------------------------------------------

describe("FindCaptionsUseCase", () => {
  it("returns each caption as a clip in its video, playing from one second before it starts", async () => {
    const mocks = createMocks(async () => found([caption()], 10000, false));

    const result = await buildSut(mocks).execute("give you up", PAGE);

    assert.deepEqual(result, {
      ok: true,
      value: {
        clips: [
          {
            captionId: "caption-1",
            video: {
              id: "video-1",
              title: "Never Gonna Give You Up",
              channel: { name: "Rick Astley" },
            },
            startTime: 2500,
            endTime: 4200,
            text: "never gonna give you up",
            playFrom: 1500,
          },
        ],
        total: 10000,
        isTotalExact: false,
      },
    });
  });

  it("plays a clip from the start of the video when its caption begins in the first second", async () => {
    const mocks = createMocks(async () =>
      found([caption({ startTime: 400, endTime: 1900 })]),
    );

    const result = await buildSut(mocks).execute("give you up", PAGE);

    assert.ok(result.ok);
    assert.equal(result.value.clips[0].playFrom, 0);
  });

  it("asks for each video once, however many of its captions were found", async () => {
    const mocks = createMocks(
      async () =>
        found([
          caption({ id: "caption-1", videoId: "video-1" }),
          caption({ id: "caption-2", videoId: "video-2" }),
          caption({ id: "caption-3", videoId: "video-1" }),
        ]),
      async () =>
        videosById(video({ id: "video-1" }), video({ id: "video-2" })),
    );

    const result = await buildSut(mocks).execute("give you up", PAGE);

    assert.deepEqual(
      mocks.clipVideoRepository.findByIds.mock.calls[0].arguments[0],
      ["video-1", "video-2"],
    );
    assert.ok(result.ok);
    assert.deepEqual(
      result.value.clips.map((clip) => [clip.captionId, clip.video.id]),
      [
        ["caption-1", "video-1"],
        ["caption-2", "video-2"],
        ["caption-3", "video-1"],
      ],
    );
  });

  it("skips a caption whose video is not in the database and warns about it", async () => {
    const mocks = createMocks(
      async () =>
        found([
          caption({ id: "orphan", videoId: "video-gone" }),
          caption({ id: "caption-2" }),
        ]),
      async () => videosById(video()),
    );

    const result = await buildSut(mocks).execute("give you up", PAGE);

    assert.ok(result.ok);
    assert.deepEqual(
      result.value.clips.map((clip) => clip.captionId),
      ["caption-2"],
    );
    assert.equal(mocks.logger.warn.mock.callCount(), 1);
  });

  it("returns a search-unavailable failure when the videos cannot be read", async () => {
    const cause = new Error("connect ECONNREFUSED 127.0.0.1:5432");
    const mocks = createMocks(undefined, async () =>
      Failure({ type: "DATABASE", error: cause }),
    );

    const result = await buildSut(mocks).execute("give you up", PAGE);

    assert.deepEqual(result, {
      ok: false,
      error: { type: "SEARCH_UNAVAILABLE", error: cause },
    });
  });

  it("passes on a search-unavailable failure without reading the videos", async () => {
    const cause = new Error("getaddrinfo ENOTFOUND elasticsearch");
    const mocks = createMocks(async () =>
      Failure({ type: "SEARCH_UNAVAILABLE", error: cause }),
    );

    const result = await buildSut(mocks).execute("give you up", PAGE);

    assert.deepEqual(result, {
      ok: false,
      error: { type: "SEARCH_UNAVAILABLE", error: cause },
    });
    assert.equal(mocks.clipVideoRepository.findByIds.mock.callCount(), 0);
  });
});
