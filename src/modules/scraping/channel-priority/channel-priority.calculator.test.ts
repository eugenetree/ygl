import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ChannelPriorityCalculator, ChannelStats } from "./channel-priority.calculator.js";
import {
  PRIORITY_BAD_CHANNEL_PENALTY,
  PRIORITY_CAPTION_WEIGHT,
  PRIORITY_DURATION_CAP,
  PRIORITY_DURATION_WEIGHT,
  PRIORITY_MANUAL_BOOST,
  PRIORITY_STATS_MIN_VIDEOS,
  PRIORITY_SUBS_CAP,
  PRIORITY_SUBS_WEIGHT,
  PRIORITY_VIEWS_CAP,
  PRIORITY_VIEWS_WEIGHT,
} from "./channel-priority.constants.js";

const calculator = new ChannelPriorityCalculator();

const baseStats: ChannelStats = {
  isBoosted: false,
  subscriberCount: 0,
  totalProcessed: 0,
  validCaptions: 0,
  avgDuration: null,
  avgViews: null,
  avgSimilarity: null,
};

describe("ChannelPriorityCalculator", () => {
  describe("caption gate", () => {
    it("does not apply caption bonus or penalty below min videos threshold", () => {
      const result = calculator.calculate({
        ...baseStats,
        totalProcessed: PRIORITY_STATS_MIN_VIDEOS - 1,
        validCaptions: 0,
      });

      assert.equal(result.scrapingScore, 0);
    });

    it("applies penalty when caption rate is at the threshold", () => {
      // exactly 10% = at threshold = penalty
      const result = calculator.calculate({
        ...baseStats,
        totalProcessed: PRIORITY_STATS_MIN_VIDEOS,
        validCaptions: PRIORITY_STATS_MIN_VIDEOS * 0.1,
      });

      assert.equal(result.scrapingScore, PRIORITY_BAD_CHANNEL_PENALTY);
    });

    it("applies penalty when caption rate is below the threshold", () => {
      const result = calculator.calculate({
        ...baseStats,
        totalProcessed: PRIORITY_STATS_MIN_VIDEOS,
        validCaptions: 5,
      });

      assert.equal(result.scrapingScore, PRIORITY_BAD_CHANNEL_PENALTY);
    });

    it("applies full caption bonus when all videos have valid captions", () => {
      const result = calculator.calculate({
        ...baseStats,
        totalProcessed: PRIORITY_STATS_MIN_VIDEOS,
        validCaptions: PRIORITY_STATS_MIN_VIDEOS,
      });

      assert.equal(result.scrapingScore, PRIORITY_CAPTION_WEIGHT);
    });

    it("applies partial caption bonus proportional to rate above threshold", () => {
      const result = calculator.calculate({
        ...baseStats,
        totalProcessed: PRIORITY_STATS_MIN_VIDEOS,
        validCaptions: PRIORITY_STATS_MIN_VIDEOS * 0.55, // midpoint between 0.10 and 1.0
      });

      assert.ok(result.scrapingScore > 0);
      assert.ok(result.scrapingScore < PRIORITY_CAPTION_WEIGHT);
    });
  });

  describe("manual boost", () => {
    it("adds manual boost when channel is boosted", () => {
      const result = calculator.calculate({ ...baseStats, isBoosted: true });

      assert.equal(result.scrapingScore, PRIORITY_MANUAL_BOOST);
    });

    it("stacks manual boost on top of caption penalty", () => {
      const result = calculator.calculate({
        ...baseStats,
        isBoosted: true,
        totalProcessed: PRIORITY_STATS_MIN_VIDEOS,
        validCaptions: 0,
      });

      assert.equal(result.scrapingScore, PRIORITY_MANUAL_BOOST + PRIORITY_BAD_CHANNEL_PENALTY);
    });
  });

  describe("subscriber count", () => {
    it("gives zero subs bonus when subscriberCount is 0", () => {
      const result = calculator.calculate({ ...baseStats, subscriberCount: 0 });

      assert.equal(result.scrapingScore, 0);
    });

    it("gives max subs bonus when subscriberCount is at cap", () => {
      const result = calculator.calculate({ ...baseStats, subscriberCount: PRIORITY_SUBS_CAP });

      assert.equal(result.scrapingScore, PRIORITY_SUBS_WEIGHT);
    });
  });

  describe("null optional stats", () => {
    it("treats null avgDuration as zero contribution", () => {
      const result = calculator.calculate({ ...baseStats, avgDuration: null });

      assert.equal(result.scrapingScore, 0);
    });

    it("treats null avgViews as zero contribution", () => {
      const result = calculator.calculate({ ...baseStats, avgViews: null });

      assert.equal(result.scrapingScore, 0);
    });

    it("treats null avgSimilarity as zero contribution", () => {
      const result = calculator.calculate({ ...baseStats, avgSimilarity: null });

      assert.equal(result.scrapingScore, 0);
    });
  });

  describe("searchScore", () => {
    it("excludes manual boost from searchScore", () => {
      const result = calculator.calculate({ ...baseStats, isBoosted: true });

      assert.equal(result.scrapingScore, PRIORITY_MANUAL_BOOST);
      assert.equal(result.searchScore, 0);
    });

    it("excludes caption penalty from searchScore", () => {
      const result = calculator.calculate({
        ...baseStats,
        totalProcessed: PRIORITY_STATS_MIN_VIDEOS,
        validCaptions: 0,
      });

      assert.equal(result.scrapingScore, PRIORITY_BAD_CHANNEL_PENALTY);
      assert.equal(result.searchScore, 0);
    });

    it("excludes similarity bonus from searchScore", () => {
      const withSimilarity = calculator.calculate({ ...baseStats, avgSimilarity: 1.0 });
      const withoutSimilarity = calculator.calculate({ ...baseStats, avgSimilarity: null });

      assert.ok(withSimilarity.scrapingScore > withoutSimilarity.scrapingScore);
      assert.equal(withSimilarity.searchScore, withoutSimilarity.searchScore);
    });

    it("includes subs in searchScore", () => {
      const result = calculator.calculate({ ...baseStats, subscriberCount: PRIORITY_SUBS_CAP });

      assert.equal(result.searchScore, PRIORITY_SUBS_WEIGHT);
    });

    it("includes duration in searchScore", () => {
      const result = calculator.calculate({ ...baseStats, avgDuration: PRIORITY_DURATION_CAP });

      assert.equal(result.searchScore, PRIORITY_DURATION_WEIGHT);
    });

    it("includes views in searchScore", () => {
      const result = calculator.calculate({ ...baseStats, avgViews: PRIORITY_VIEWS_CAP });

      assert.equal(result.searchScore, PRIORITY_VIEWS_WEIGHT);
    });
  });
});
