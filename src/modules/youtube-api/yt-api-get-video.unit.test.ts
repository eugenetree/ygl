/**
 * Unit tests for YoutubeApiGetVideo language key selection logic.
 *
 * Run with:  npx tsx --test src/modules/youtube-api/yt-api-get-video.unit.test.ts
 */

import "reflect-metadata";
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import * as path from "node:path";

import { YoutubeApiGetVideo } from "./yt-api-get-video.js";
import { Logger } from "../_common/logger/logger.js";
import type { YtDlpClient } from "./yt-dlp-client.js";
import type { Result } from "../../types/index.js";
import type { YtDlpError, MembersOnlyVideoError } from "./yt-dlp-client.js";

// ── Minimal json3 content accepted by captionsExtractor ──────────────────────

const MINIMAL_JSON3 = JSON.stringify({
  events: [{ tStartMs: 0, dDurationMs: 1000, segs: [{ utf8: "hello" }] }],
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function captionEntry() {
  return [{ ext: "json3", url: "https://example.com/caps.json3" }];
}

function baseYtData(overrides: Record<string, unknown> = {}) {
  return {
    id: "testVideoId",
    title: "Test Video",
    duration: 60,
    channel_id: "UC123",
    thumbnail: "https://example.com/thumb.jpg",
    ...overrides,
  };
}

// ── Mock client ───────────────────────────────────────────────────────────────

class MockYtDlpClient {
  capturedSubLangs: { auto: string | null; manual: string | null } = {
    auto: null,
    manual: null,
  };

  constructor(private readonly ytDlpResponse: unknown) {}

  async execJson<T>(
    _args: string[]
  ): Promise<Result<T[], YtDlpError | MembersOnlyVideoError>> {
    return { ok: true, value: [this.ytDlpResponse as T] };
  }

  async exec(
    args: string[]
  ): Promise<Result<void, YtDlpError | MembersOnlyVideoError>> {
    // Capture --sub-langs value
    const subLangsIdx = args.indexOf("--sub-langs");
    if (subLangsIdx !== -1) {
      const lang = args[subLangsIdx + 1]!;
      if (args.includes("--write-auto-subs")) this.capturedSubLangs.auto = lang;
      else this.capturedSubLangs.manual = lang;
    }

    // Write a valid json3 file to the output dir so findSubtitleFile succeeds
    const oIdx = args.indexOf("-o");
    if (oIdx !== -1) {
      const outTemplate = args[oIdx + 1]!; // e.g. "/tmp/.../auto/%(id)s"
      const outDir = path.dirname(outTemplate);
      await mkdir(outDir, { recursive: true });
      await writeFile(path.join(outDir, "video.json3"), MINIMAL_JSON3);
    }

    return { ok: true, value: undefined };
  }
}

function createService(ytDlpData: unknown) {
  const logger = new Logger({ context: "test", category: "test" });
  const mockClient = new MockYtDlpClient(ytDlpData);
  const service = new YoutubeApiGetVideo(
    logger,
    mockClient as unknown as YtDlpClient
  );
  return { service, mockClient };
}

// ── Skip delays introduced by getVideo / downloadCaptions ─────────────────────

let originalSetTimeout: typeof globalThis.setTimeout;

before(() => {
  originalSetTimeout = globalThis.setTimeout;
  (globalThis as any).setTimeout = (
    fn: (...args: unknown[]) => void,
    _delay?: number,
    ...args: unknown[]
  ) => originalSetTimeout(fn, 0, ...args);
});

after(() => {
  globalThis.setTimeout = originalSetTimeout;
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("YoutubeApiGetVideo - language key selection", () => {
  describe("auto captions key", () => {
    it("prefers exact 'en' over en-orig and en-qlPKC2UN_YU", async () => {
      const { service, mockClient } = createService(
        baseYtData({
          language: "en",
          automatic_captions: {
            "en-orig": captionEntry(),
            "en": captionEntry(),
            "en-qlPKC2UN_YU": captionEntry(),
          },
          subtitles: { "en": captionEntry() },
        })
      );

      await service.getVideo("testVideoId");

      assert.equal(mockClient.capturedSubLangs.auto, "en");
    });

    it("falls back to 'en-orig' when exact 'en' is absent", async () => {
      const { service, mockClient } = createService(
        baseYtData({
          language: "en",
          automatic_captions: {
            "en-orig": captionEntry(),
            "en-qlPKC2UN_YU": captionEntry(),
          },
          subtitles: { "en": captionEntry() },
        })
      );

      await service.getVideo("testVideoId");

      assert.equal(mockClient.capturedSubLangs.auto, "en-orig");
    });
  });

  describe("manual captions key", () => {
    it("prefers exact 'en' over en-qlPKC2UN_YU", async () => {
      const { service, mockClient } = createService(
        baseYtData({
          language: "en",
          automatic_captions: { "en": captionEntry() },
          subtitles: {
            "en-qlPKC2UN_YU": captionEntry(),
            "en": captionEntry(),
          },
        })
      );

      await service.getVideo("testVideoId");

      assert.equal(mockClient.capturedSubLangs.manual, "en");
    });

    it("uses 'en-qlPKC2UN_YU' when that is the only match", async () => {
      const { service, mockClient } = createService(
        baseYtData({
          language: "en",
          automatic_captions: { "en": captionEntry() },
          subtitles: { "en-qlPKC2UN_YU": captionEntry() },
        })
      );

      await service.getVideo("testVideoId");

      assert.equal(mockClient.capturedSubLangs.manual, "en-qlPKC2UN_YU");
    });
  });

  describe("captionStatus", () => {
    it("returns AUTO_ONLY when subtitles has no matching language", async () => {
      const { service } = createService(
        baseYtData({
          language: "en",
          automatic_captions: { "en": captionEntry() },
          subtitles: { "fr": captionEntry() },
        })
      );

      const result = await service.getVideo("testVideoId");

      assert.ok(result.ok);
      assert.equal(result.value.captionStatus, "AUTO_ONLY");
    });

    it("returns MANUAL_ONLY when automatic_captions has no matching language", async () => {
      const { service } = createService(
        baseYtData({
          language: "en",
          automatic_captions: { "fr": captionEntry() },
          subtitles: { "en": captionEntry() },
        })
      );

      const result = await service.getVideo("testVideoId");

      assert.ok(result.ok);
      assert.equal(result.value.captionStatus, "MANUAL_ONLY");
    });

    it("returns NONE when no captions match the detected language", async () => {
      const { service } = createService(
        baseYtData({
          language: "en",
          automatic_captions: { "fr": captionEntry() },
          subtitles: { "de": captionEntry() },
        })
      );

      const result = await service.getVideo("testVideoId");

      assert.ok(result.ok);
      assert.equal(result.value.captionStatus, "NONE");
    });

    it("returns BOTH and captions when both track types match", async () => {
      const { service } = createService(
        baseYtData({
          language: "en",
          automatic_captions: { "en": captionEntry() },
          subtitles: { "en": captionEntry() },
        })
      );

      const result = await service.getVideo("testVideoId");

      assert.ok(result.ok);
      assert.equal(result.value.captionStatus, "BOTH");
      assert.ok(result.value.autoCaptions!.length > 0);
      assert.ok(result.value.manualCaptions!.length > 0);
    });
  });

  describe("language detection", () => {
    it("keeps 'en-us' as-is since it is a valid LanguageCode", async () => {
      const { service } = createService(
        baseYtData({
          language: "en-US",
          automatic_captions: { "en": captionEntry() },
          subtitles: {},
        })
      );

      const result = await service.getVideo("testVideoId");

      assert.ok(result.ok);
      // "en-US" lowercases to "en-us" which is a valid LanguageCode — kept as-is
      assert.equal(result.value.languageCode, "en-us");
      // "en-us".startsWith("en") so the "en" auto track is still matched
      assert.equal(result.value.captionStatus, "AUTO_ONLY");
    });

    it("returns null languageCode when language field is absent", async () => {
      const { service } = createService(
        baseYtData({
          language: null,
          automatic_captions: {},
          subtitles: { "en": captionEntry() },
        })
      );

      const result = await service.getVideo("testVideoId");

      assert.ok(result.ok);
      assert.equal(result.value.languageCode, null);
    });
  });
});
