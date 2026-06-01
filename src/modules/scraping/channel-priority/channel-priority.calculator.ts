import { injectable } from "inversify";
import {
  PRIORITY_BAD_CHANNEL_PENALTY,
  PRIORITY_CAPTION_THRESHOLD,
  PRIORITY_CAPTION_WEIGHT,
  PRIORITY_DURATION_CAP,
  PRIORITY_DURATION_WEIGHT,
  PRIORITY_LANGUAGE_MIN_VIDEOS,
  PRIORITY_MANUAL_BOOST,
  PRIORITY_NON_ENGLISH_THRESHOLD,
  PRIORITY_SIMILARITY_WEIGHT,
  PRIORITY_STATS_MIN_VIDEOS,
  PRIORITY_SUBS_CAP,
  PRIORITY_SUBS_WEIGHT,
  PRIORITY_VIEWS_CAP,
  PRIORITY_VIEWS_WEIGHT,
} from "./channel-priority.constants.js";

export type ChannelStats = {
  isBoosted: boolean;
  subscriberCount: number;
  totalProcessed: number;
  validCaptions: number;
  nonEnglishCount: number;
  avgDuration: number | null;
  avgViews: number | null;
  avgSimilarity: number | null;
};

export type PriorityScores = {
  scrapingScore: number;
  searchScore: number;
  components: Record<string, unknown>;
};

const clamp01 = (n: number): number => Math.max(0, Math.min(1, n));

const logNorm = (value: number, cap: number): number =>
  clamp01(Math.log10(value + 1) / Math.log10(cap + 1));

const round2 = (n: number): number => Math.round(n * 100) / 100;

@injectable()
export class ChannelPriorityCalculator {
  calculate(stats: ChannelStats): PriorityScores {
    const {
      isBoosted,
      subscriberCount,
      totalProcessed,
      validCaptions,
      nonEnglishCount,
      avgDuration,
      avgViews,
      avgSimilarity,
    } = stats;

    let captionBonus = 0;
    let captionPenalty = 0;
    if (totalProcessed >= PRIORITY_STATS_MIN_VIDEOS) {
      const captionRate = validCaptions / totalProcessed;
      if (captionRate <= PRIORITY_CAPTION_THRESHOLD) {
        captionPenalty = PRIORITY_BAD_CHANNEL_PENALTY;
      } else {
        const norm = clamp01(
          (captionRate - PRIORITY_CAPTION_THRESHOLD) /
            (1 - PRIORITY_CAPTION_THRESHOLD),
        );
        captionBonus = norm * PRIORITY_CAPTION_WEIGHT;
      }
    }

    let languagePenalty = 0;
    const languageGateActive = totalProcessed >= PRIORITY_LANGUAGE_MIN_VIDEOS;
    const nonEnglishRate =
      totalProcessed > 0 ? nonEnglishCount / totalProcessed : null;
    if (
      languageGateActive &&
      nonEnglishRate !== null &&
      nonEnglishRate >= PRIORITY_NON_ENGLISH_THRESHOLD
    ) {
      languagePenalty = PRIORITY_BAD_CHANNEL_PENALTY;
    }

    const subsBonus =
      logNorm(subscriberCount, PRIORITY_SUBS_CAP) * PRIORITY_SUBS_WEIGHT;
    const durationBonus =
      avgDuration != null
        ? logNorm(avgDuration, PRIORITY_DURATION_CAP) * PRIORITY_DURATION_WEIGHT
        : 0;
    const viewsBonus =
      avgViews != null
        ? logNorm(avgViews, PRIORITY_VIEWS_CAP) * PRIORITY_VIEWS_WEIGHT
        : 0;
    const similarityBonus =
      avgSimilarity != null
        ? clamp01(avgSimilarity) * PRIORITY_SIMILARITY_WEIGHT
        : 0;
    const manualBoost = isBoosted ? PRIORITY_MANUAL_BOOST : 0;

    const captionRate =
      totalProcessed > 0 ? validCaptions / totalProcessed : null;
    const captionValue = captionBonus + captionPenalty;

    const components = {
      captions: {
        value: round2(captionValue),
        totalVideos: totalProcessed,
        validVideos: validCaptions,
        rate: captionRate != null ? round2(captionRate) : null,
        threshold: PRIORITY_CAPTION_THRESHOLD,
        minVideos: PRIORITY_STATS_MIN_VIDEOS,
        gateActive: totalProcessed >= PRIORITY_STATS_MIN_VIDEOS,
        weight: PRIORITY_CAPTION_WEIGHT,
        penalty: PRIORITY_BAD_CHANNEL_PENALTY,
      },
      language: {
        value: round2(languagePenalty),
        totalVideos: totalProcessed,
        nonEnglishVideos: nonEnglishCount,
        rate: nonEnglishRate != null ? round2(nonEnglishRate) : null,
        threshold: PRIORITY_NON_ENGLISH_THRESHOLD,
        minVideos: PRIORITY_LANGUAGE_MIN_VIDEOS,
        gateActive: languageGateActive,
        penalty: PRIORITY_BAD_CHANNEL_PENALTY,
      },
      subs: {
        value: round2(subsBonus),
        subscriberCount,
        cap: PRIORITY_SUBS_CAP,
        weight: PRIORITY_SUBS_WEIGHT,
      },
      duration: {
        value: round2(durationBonus),
        avgDuration: avgDuration != null ? round2(avgDuration) : null,
        cap: PRIORITY_DURATION_CAP,
        weight: PRIORITY_DURATION_WEIGHT,
      },
      views: {
        value: round2(viewsBonus),
        avgViews: avgViews != null ? round2(avgViews) : null,
        cap: PRIORITY_VIEWS_CAP,
        weight: PRIORITY_VIEWS_WEIGHT,
      },
      similarity: {
        value: round2(similarityBonus),
        avgSimilarity: avgSimilarity != null ? round2(avgSimilarity) : null,
        weight: PRIORITY_SIMILARITY_WEIGHT,
      },
      manualBoost: {
        value: manualBoost,
        isBoosted,
        amount: PRIORITY_MANUAL_BOOST,
      },
    };

    const scrapingScore =
      captionValue +
      languagePenalty +
      subsBonus +
      durationBonus +
      viewsBonus +
      similarityBonus +
      manualBoost;
    const searchScore = subsBonus + durationBonus + viewsBonus;

    return {
      scrapingScore,
      searchScore,
      components: components as unknown as Record<string, unknown>,
    };
  }
}
