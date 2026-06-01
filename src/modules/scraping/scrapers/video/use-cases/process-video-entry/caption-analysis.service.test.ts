import assert from "node:assert/strict";
import { beforeEach, describe, it, mock } from "node:test";
import { Failure, Success } from "../../../../../../types/index.js";
import { CAPTIONS_PROCESSING_ALGORITHM_VERSION } from "../../config.js";
import { AutoCaptionsValidator } from "./auto-captions.validator.js";
import {
  CaptionAnalysisService,
  type CaptionSegment,
} from "./caption-analysis.service.js";
import { CaptionSimilarityService } from "./captions-similarity.service.js";
import { ManualCaptionsValidator } from "./manual-captions.validator.js";

// ---- Fixtures ---------------------------------------------------------------

const seg = (text: string, start = 0, end = 1): CaptionSegment => ({
  text,
  startTime: start,
  endTime: end,
  duration: end - start,
});

const autoSegs: CaptionSegment[] = [seg("hello world")];
const manualSegs: CaptionSegment[] = [seg("hello world")];

// ---- Factory ----------------------------------------------------------------

function createMocks() {
  return {
    manualCaptionsValidator: {
      validate: mock.fn<ManualCaptionsValidator["validate"]>(),
    },
    autoCaptionsValidator: {
      validate: mock.fn<AutoCaptionsValidator["validate"]>(),
    },
    captionsSimilarityService: {
      calculateSimilarity:
        mock.fn<CaptionSimilarityService["calculateSimilarity"]>(),
    },
  };
}

function buildSut(mocks: ReturnType<typeof createMocks>) {
  return new CaptionAnalysisService(
    mocks.manualCaptionsValidator as unknown as ManualCaptionsValidator,
    mocks.autoCaptionsValidator as unknown as AutoCaptionsValidator,
    mocks.captionsSimilarityService as unknown as CaptionSimilarityService,
  );
}

// ---- Tests ------------------------------------------------------------------

describe("CaptionAnalysisService", () => {
  let mocks: ReturnType<typeof createMocks>;
  let sut: CaptionAnalysisService;

  beforeEach(() => {
    mocks = createMocks();

    mocks.autoCaptionsValidator.validate.mock.mockImplementation(() =>
      Success(undefined),
    );
    mocks.manualCaptionsValidator.validate.mock.mockImplementation(() =>
      Success(undefined),
    );
    mocks.captionsSimilarityService.calculateSimilarity.mock.mockImplementation(
      () => ({
        score: 0.9,
        shiftMs: 0,
        missingTokens: [],
        timingMissTokens: [],
        manualTokenCount: 5,
        autoTokenCount: 5,
      }),
    );

    sut = buildSut(mocks);
  });

  describe("both tracks ABSENT", () => {
    it("returns CAPTIONS_ABSENT for both when no captions exist", () => {
      const result = sut.analyze({
        autoCaptions: { state: "ABSENT" },
        manualCaptions: { state: "ABSENT" },
      });

      assert.equal(result.autoCaptionsStatus, "CAPTIONS_ABSENT");
      assert.equal(result.manualCaptionsStatus, "CAPTIONS_ABSENT");
      assert.equal(result.captionsSimilarityScore, null);
      assert.equal(result.captionsShift, null);
    });

    it("does not call validators when both tracks are ABSENT", () => {
      sut.analyze({
        autoCaptions: { state: "ABSENT" },
        manualCaptions: { state: "ABSENT" },
      });

      assert.equal(mocks.autoCaptionsValidator.validate.mock.callCount(), 0);
      assert.equal(mocks.manualCaptionsValidator.validate.mock.callCount(), 0);
    });
  });

  describe("auto PRESENT_NOT_FETCHED, manual ABSENT", () => {
    it("returns CAPTIONS_NOT_FETCHED for auto and CAPTIONS_ABSENT for manual", () => {
      const result = sut.analyze({
        autoCaptions: { state: "PRESENT_NOT_FETCHED" },
        manualCaptions: { state: "ABSENT" },
      });

      assert.equal(result.autoCaptionsStatus, "CAPTIONS_NOT_FETCHED");
      assert.equal(result.manualCaptionsStatus, "CAPTIONS_ABSENT");
      assert.equal(result.captionsSimilarityScore, null);
      assert.equal(result.captionsShift, null);
    });
  });

  describe("auto ABSENT, manual PRESENT_NOT_FETCHED", () => {
    it("returns CAPTIONS_ABSENT for auto and CAPTIONS_NOT_FETCHED for manual", () => {
      const result = sut.analyze({
        autoCaptions: { state: "ABSENT" },
        manualCaptions: { state: "PRESENT_NOT_FETCHED" },
      });

      assert.equal(result.autoCaptionsStatus, "CAPTIONS_ABSENT");
      assert.equal(result.manualCaptionsStatus, "CAPTIONS_NOT_FETCHED");
      assert.equal(result.captionsSimilarityScore, null);
      assert.equal(result.captionsShift, null);
    });
  });

  describe("both tracks PRESENT_NOT_FETCHED", () => {
    it("returns CAPTIONS_NOT_FETCHED for both (e.g. non-EN video with both tracks)", () => {
      const result = sut.analyze({
        autoCaptions: { state: "PRESENT_NOT_FETCHED" },
        manualCaptions: { state: "PRESENT_NOT_FETCHED" },
      });

      assert.equal(result.autoCaptionsStatus, "CAPTIONS_NOT_FETCHED");
      assert.equal(result.manualCaptionsStatus, "CAPTIONS_NOT_FETCHED");
      assert.equal(result.captionsSimilarityScore, null);
      assert.equal(result.captionsShift, null);
    });

    it("does not call validators when both tracks are PRESENT_NOT_FETCHED", () => {
      sut.analyze({
        autoCaptions: { state: "PRESENT_NOT_FETCHED" },
        manualCaptions: { state: "PRESENT_NOT_FETCHED" },
      });

      assert.equal(mocks.autoCaptionsValidator.validate.mock.callCount(), 0);
      assert.equal(mocks.manualCaptionsValidator.validate.mock.callCount(), 0);
    });
  });

  describe("both tracks FETCHED", () => {
    const both = {
      autoCaptions: { state: "FETCHED" as const, data: autoSegs },
      manualCaptions: { state: "FETCHED" as const, data: manualSegs },
    };

    it("returns CAPTIONS_VALID for both when validators pass", () => {
      const result = sut.analyze(both);

      assert.equal(result.autoCaptionsStatus, "CAPTIONS_VALID");
      assert.equal(result.manualCaptionsStatus, "CAPTIONS_VALID");
    });

    it("calculates similarity score when both are valid", () => {
      mocks.captionsSimilarityService.calculateSimilarity.mock.mockImplementation(
        () => ({
          score: 0.85,
          shiftMs: 200,
          missingTokens: [],
          timingMissTokens: [],
          manualTokenCount: 10,
          autoTokenCount: 10,
        }),
      );

      const result = sut.analyze(both);

      assert.equal(result.captionsSimilarityScore, 0.85);
      assert.equal(result.captionsShift, 200);
    });

    it("passes captions to similarity service", () => {
      sut.analyze(both);

      assert.equal(
        mocks.captionsSimilarityService.calculateSimilarity.mock.callCount(),
        1,
      );
      const args =
        mocks.captionsSimilarityService.calculateSimilarity.mock.calls[0]!
          .arguments[0];
      assert.deepEqual(args.autoCaptions, autoSegs);
      assert.deepEqual(args.manualCaptions, manualSegs);
    });

    it("sets auto status from validator error when auto validation fails", () => {
      mocks.autoCaptionsValidator.validate.mock.mockImplementation(() =>
        Failure({ type: "CAPTIONS_TOO_SHORT" }),
      );

      const result = sut.analyze(both);

      assert.equal(result.autoCaptionsStatus, "CAPTIONS_TOO_SHORT");
    });

    it("sets manual status from validator error when manual validation fails", () => {
      mocks.manualCaptionsValidator.validate.mock.mockImplementation(() =>
        Failure({ type: "CAPTIONS_MOSTLY_UPPERCASE" }),
      );

      const result = sut.analyze(both);

      assert.equal(result.manualCaptionsStatus, "CAPTIONS_MOSTLY_UPPERCASE");
    });

    it("still computes similarity score when auto validation fails", () => {
      mocks.autoCaptionsValidator.validate.mock.mockImplementation(() =>
        Failure({ type: "CAPTIONS_EMPTY" }),
      );
      mocks.captionsSimilarityService.calculateSimilarity.mock.mockImplementation(
        () => ({
          score: 0.5,
          shiftMs: 0,
          missingTokens: [],
          timingMissTokens: [],
          manualTokenCount: 5,
          autoTokenCount: 5,
        }),
      );

      const result = sut.analyze(both);

      assert.equal(result.captionsSimilarityScore, 0.5);
    });

    it("still computes similarity score when manual validation fails", () => {
      mocks.manualCaptionsValidator.validate.mock.mockImplementation(() =>
        Failure({ type: "CAPTIONS_HAS_OVERLAPPING_TIMESTAMPS" }),
      );
      mocks.captionsSimilarityService.calculateSimilarity.mock.mockImplementation(
        () => ({
          score: 0.3,
          shiftMs: 100,
          missingTokens: [],
          timingMissTokens: [],
          manualTokenCount: 5,
          autoTokenCount: 5,
        }),
      );

      const result = sut.analyze(both);

      assert.equal(result.captionsSimilarityScore, 0.3);
    });
  });

  describe("captionsProcessingAlgorithmVersion", () => {
    it("is included in every result", () => {
      const result = sut.analyze({
        autoCaptions: { state: "ABSENT" },
        manualCaptions: { state: "ABSENT" },
      });

      assert.equal(
        result.captionsProcessingAlgorithmVersion,
        CAPTIONS_PROCESSING_ALGORITHM_VERSION,
      );
    });
  });
});
