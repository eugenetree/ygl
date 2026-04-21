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
    const subLangsIdx = args.indexOf("--sub-langs");
    if (subLangsIdx !== -1) {
      const lang = args[subLangsIdx + 1]!;
      if (args.includes("--write-auto-subs")) this.capturedSubLangs.auto = lang;
      else this.capturedSubLangs.manual = lang;
    }

    const oIdx = args.indexOf("-o");
    if (oIdx !== -1) {
      const outTemplate = args[oIdx + 1]!;
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
  describe("auto captions key (findOrigTrack)", () => {
    it("uses en-orig as the auto captions key", async () => {
      const { service, mockClient } = createService(
        baseYtData({
          automatic_captions: {
            "en-orig": captionEntry(),
            "fr": captionEntry(),
          },
          subtitles: { "en": captionEntry() },
        })
      );

      await service.getVideo("testVideoId");

      assert.equal(mockClient.capturedSubLangs.auto, "en-orig");
    });

    it("uses th-orig for a Thai video, ignoring non-orig keys", async () => {
      const { service, mockClient } = createService(
        baseYtData({
          automatic_captions: {
            "th-orig": captionEntry(),
            "en": captionEntry(), // auto-translated — must be ignored
          },
          subtitles: { "th": captionEntry() },
        })
      );

      await service.getVideo("testVideoId");

      assert.equal(mockClient.capturedSubLangs.auto, "th-orig");
    });

    it("returns MANUAL_ONLY when automatic_captions has no *-orig key", async () => {
      const { service } = createService(
        baseYtData({
          automatic_captions: { "en": captionEntry() },
          subtitles: { "en": captionEntry() },
        })
      );

      const result = await service.getVideo("testVideoId");

      assert.ok(result.ok);
      assert.equal(result.value.captionStatus, "MANUAL_ONLY");
      assert.equal(result.value.languageCode, null);
    });
  });

  describe("manual captions key (findMatchingKey)", () => {
    it("prefers exact match over prefix match", async () => {
      const { service, mockClient } = createService(
        baseYtData({
          automatic_captions: { "en-orig": captionEntry() },
          subtitles: {
            "en-qlPKC2UN_YU": captionEntry(),
            "en": captionEntry(),
          },
        })
      );

      await service.getVideo("testVideoId");

      assert.equal(mockClient.capturedSubLangs.manual, "en");
    });

    it("falls back to prefix match when no exact key (en-US)", async () => {
      const { service, mockClient } = createService(
        baseYtData({
          automatic_captions: { "en-orig": captionEntry() },
          subtitles: { "en-US": captionEntry() },
        })
      );

      await service.getVideo("testVideoId");

      assert.equal(mockClient.capturedSubLangs.manual, "en-US");
    });

    it("matches en-qlPKC2UN_YU via prefix when it is the only subtitle", async () => {
      const { service, mockClient } = createService(
        baseYtData({
          automatic_captions: { "en-orig": captionEntry() },
          subtitles: { "en-qlPKC2UN_YU": captionEntry() },
        })
      );

      await service.getVideo("testVideoId");

      assert.equal(mockClient.capturedSubLangs.manual, "en-qlPKC2UN_YU");
    });
  });

  describe("captionStatus", () => {
    it("returns BOTH when *-orig and matching manual subtitle are present", async () => {
      const { service } = createService(
        baseYtData({
          automatic_captions: { "en-orig": captionEntry() },
          subtitles: { "en": captionEntry() },
        })
      );

      const result = await service.getVideo("testVideoId");

      assert.ok(result.ok);
      assert.equal(result.value.captionStatus, "BOTH");
      assert.ok(result.value.autoCaptions!.length > 0);
      assert.ok(result.value.manualCaptions!.length > 0);
    });

    it("returns AUTO_ONLY when *-orig found but no matching manual subtitle", async () => {
      const { service } = createService(
        baseYtData({
          automatic_captions: { "en-orig": captionEntry() },
          subtitles: { "fr": captionEntry() },
        })
      );

      const result = await service.getVideo("testVideoId");

      assert.ok(result.ok);
      assert.equal(result.value.captionStatus, "AUTO_ONLY");
    });

    it("returns MANUAL_ONLY when no *-orig key but subtitles exist", async () => {
      const { service } = createService(
        baseYtData({
          automatic_captions: { "en": captionEntry() },
          subtitles: { "en": captionEntry() },
        })
      );

      const result = await service.getVideo("testVideoId");

      assert.ok(result.ok);
      assert.equal(result.value.captionStatus, "MANUAL_ONLY");
    });

    it("returns MANUAL_ONLY when automatic_captions absent and subtitles exist in another language (fr)", async () => {
      const { service } = createService(
        baseYtData({
          automatic_captions: {},
          subtitles: { "fr": captionEntry() },
        })
      );

      const result = await service.getVideo("testVideoId");

      assert.ok(result.ok);
      assert.equal(result.value.captionStatus, "MANUAL_ONLY");
      assert.equal(result.value.languageCode, null);
    });

    it("returns NONE when no *-orig key and no subtitles", async () => {
      const { service } = createService(
        baseYtData({
          automatic_captions: { "en": captionEntry() },
          subtitles: {},
        })
      );

      const result = await service.getVideo("testVideoId");

      assert.ok(result.ok);
      assert.equal(result.value.captionStatus, "NONE");
    });
  });

  describe("language detection", () => {
    it("extracts language code from *-orig key, ignoring yt-dlp language field", async () => {
      const { service } = createService(
        baseYtData({
          language: "en-US", // yt-dlp says English — should be ignored
          automatic_captions: {
            "th-orig": captionEntry(), // actual spoken language is Thai
            "en": captionEntry(),
          },
          subtitles: {},
        })
      );

      const result = await service.getVideo("testVideoId");

      assert.ok(result.ok);
      assert.equal(result.value.languageCode, "th");
    });

    it("returns null languageCode when no *-orig key is present", async () => {
      const { service } = createService(
        baseYtData({
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
