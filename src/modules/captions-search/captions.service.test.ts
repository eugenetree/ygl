import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";
import type { Client } from "@elastic/elasticsearch";
import type { Logger } from "../_common/logger/logger.js";
import { CaptionsService } from "./captions.service.js";

// ---- Fixtures ---------------------------------------------------------------

const storedCaption = (overrides: Record<string, unknown> = {}) => ({
  id: "caption-1",
  videoId: "video-1",
  startTime: 2500,
  endTime: 4200,
  duration: 1700,
  text: "never gonna give you up",
  type: "manual",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  channelSearchScore: 0.87,
  ...overrides,
});

const searchResponse = (
  sources: Record<string, unknown>[],
  total: { value: number; relation: "eq" | "gte" } = {
    value: sources.length,
    relation: "eq",
  },
) => ({
  hits: {
    total,
    hits: sources.map((source, i) => ({
      _index: "captions",
      _id: String(source.id ?? i),
      _score: 1,
      _source: source,
    })),
  },
});

// ---- Factory ----------------------------------------------------------------

function createMocks(response: unknown = searchResponse([])) {
  return {
    esClient: {
      search: mock.fn(async (_request: unknown) => response),
    },
    logger: {
      setContext: mock.fn(),
      info: mock.fn(),
      warn: mock.fn(),
      error: mock.fn(),
    },
  };
}

function buildSut(mocks: ReturnType<typeof createMocks>) {
  return new CaptionsService(
    mocks.logger as unknown as Logger,
    mocks.esClient as unknown as Client,
  );
}

// ---- Tests ------------------------------------------------------------------

describe("CaptionsService.search", () => {
  it("returns a stored caption as a clip that plays from one second before it starts", async () => {
    const mocks = createMocks(searchResponse([storedCaption()]));

    const result = await buildSut(mocks).search("give you up", {
      offset: 0,
      limit: 20,
    });

    assert.deepEqual(result, {
      ok: true,
      value: {
        clips: [
          {
            captionId: "caption-1",
            videoId: "video-1",
            startTime: 2500,
            endTime: 4200,
            text: "never gonna give you up",
            playFrom: 1500,
          },
        ],
        total: 1,
        isTotalExact: true,
      },
    });
  });

  it("plays a clip from the start of the video when its caption begins in the first second", async () => {
    const mocks = createMocks(
      searchResponse([storedCaption({ startTime: 400, endTime: 1900 })]),
    );

    const result = await buildSut(mocks).search("give you up", {
      offset: 0,
      limit: 20,
    });

    assert.ok(result.ok);
    assert.equal(result.value.clips[0].playFrom, 0);
  });

  it("skips a stored caption that does not match the expected shape and warns about it", async () => {
    const mocks = createMocks(
      searchResponse([
        storedCaption({ id: "broken", startTime: "2500" }),
        storedCaption({ id: "caption-2" }),
      ]),
    );

    const result = await buildSut(mocks).search("give you up", {
      offset: 0,
      limit: 20,
    });

    assert.ok(result.ok);
    assert.deepEqual(
      result.value.clips.map((clip) => clip.captionId),
      ["caption-2"],
    );
    assert.equal(mocks.logger.warn.mock.callCount(), 1);
  });

  it("reports a total past 10,000 as 10,000 and not exact", async () => {
    const mocks = createMocks(
      searchResponse([storedCaption()], { value: 10000, relation: "gte" }),
    );

    const result = await buildSut(mocks).search("the", {
      offset: 0,
      limit: 20,
    });

    assert.ok(result.ok);
    assert.equal(result.value.total, 10000);
    assert.equal(result.value.isTotalExact, false);
  });

  it("asks Elasticsearch for one page of captions ordered by relevance, then caption id", async () => {
    const mocks = createMocks();

    await buildSut(mocks).search("give you up", { offset: 40, limit: 20 });

    const request = mocks.esClient.search.mock.calls[0].arguments[0] as Record<
      string,
      unknown
    >;
    assert.equal(request.from, 40);
    assert.equal(request.size, 20);
    assert.deepEqual(request.sort, [
      { _score: { order: "desc" } },
      { id: { order: "asc" } },
    ]);
    assert.equal(request.track_total_hits, 10000);
  });

  it("returns a search-unavailable failure when Elasticsearch cannot be reached", async () => {
    const mocks = createMocks();
    const cause = new Error("getaddrinfo ENOTFOUND elasticsearch");
    mocks.esClient.search.mock.mockImplementation(async () => {
      throw cause;
    });

    const result = await buildSut(mocks).search("give you up", {
      offset: 0,
      limit: 20,
    });

    assert.deepEqual(result, {
      ok: false,
      error: { type: "SEARCH_UNAVAILABLE", error: cause },
    });
  });
});

describe("CaptionsService.findByVideo", () => {
  it("returns the video's stored captions with their times and text", async () => {
    const mocks = createMocks(
      searchResponse([
        storedCaption(),
        storedCaption({
          id: "caption-2",
          startTime: 4200,
          endTime: 6100,
          text: "never gonna let you down",
        }),
      ]),
    );

    const result = await buildSut(mocks).findByVideo("dQw4w9WgXcQ");

    assert.deepEqual(result, {
      ok: true,
      value: [
        {
          captionId: "caption-1",
          startTime: 2500,
          endTime: 4200,
          text: "never gonna give you up",
        },
        {
          captionId: "caption-2",
          startTime: 4200,
          endTime: 6100,
          text: "never gonna let you down",
        },
      ],
    });
  });

  it("asks Elasticsearch for every caption of the video, in the order they are spoken", async () => {
    const mocks = createMocks();

    await buildSut(mocks).findByVideo("dQw4w9WgXcQ");

    const request = mocks.esClient.search.mock.calls[0].arguments[0] as Record<
      string,
      unknown
    >;
    assert.deepEqual(request.query, {
      term: { "videoId.keyword": "dQw4w9WgXcQ" },
    });
    assert.deepEqual(request.sort, [
      { startTime: { order: "asc" } },
      { id: { order: "asc" } },
    ]);
    assert.equal(request.size, 10000);
  });

  it("skips a stored caption that does not match the expected shape and warns about it", async () => {
    const mocks = createMocks(
      searchResponse([
        storedCaption({ id: "broken", text: null }),
        storedCaption({ id: "caption-2" }),
      ]),
    );

    const result = await buildSut(mocks).findByVideo("dQw4w9WgXcQ");

    assert.ok(result.ok);
    assert.deepEqual(
      result.value.map((caption) => caption.captionId),
      ["caption-2"],
    );
    assert.equal(mocks.logger.warn.mock.callCount(), 1);
  });

  it("returns a search-unavailable failure when Elasticsearch cannot be reached", async () => {
    const mocks = createMocks();
    const cause = new Error("getaddrinfo ENOTFOUND elasticsearch");
    mocks.esClient.search.mock.mockImplementation(async () => {
      throw cause;
    });

    const result = await buildSut(mocks).findByVideo("dQw4w9WgXcQ");

    assert.deepEqual(result, {
      ok: false,
      error: { type: "SEARCH_UNAVAILABLE", error: cause },
    });
  });
});
