import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import type { Logger } from "../../../../../_common/logger/logger.js";
import type { CaptionSegment } from "./caption-analysis.service.js";
import type { CaptionCleanUpService } from "./caption-clean-up.service.js";
import { CaptionSimilarityService } from "./captions-similarity.service.js";

function loadFixture(name: string): CaptionSegment[] {
  return JSON.parse(
    readFileSync(`src/fixtures/captions/converted/${name}.json`, "utf-8"),
  ) as CaptionSegment[];
}

const silentLogger = {
  info: () => {},
  warn: () => {},
  error: () => {},
} as unknown as Logger;

function createService(): CaptionSimilarityService {
  return new CaptionSimilarityService(
    silentLogger,
    {} as CaptionCleanUpService,
  );
}

describe("CaptionSimilarityService.calculateSimilarity", () => {
  it("returns shiftMs=0 when captions are in sync", () => {
    const service = createService();
    const result = service.calculateSimilarity({
      manualCaptions: loadFixture("0s_shift_manual"),
      autoCaptions: loadFixture("0s_shift_auto"),
    });
    assert.equal(result.shiftMs, 0);
  });

  it("returns shiftMs=3000 when auto captions are 3s behind manual", () => {
    const service = createService();
    const result = service.calculateSimilarity({
      manualCaptions: loadFixture("3s_shift_manual"),
      autoCaptions: loadFixture("3s_shift_auto"),
    });
    assert.equal(result.shiftMs, 3000);
  });
});
