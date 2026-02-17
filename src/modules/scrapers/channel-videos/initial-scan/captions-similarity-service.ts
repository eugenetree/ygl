import { injectable } from "inversify";
import { Caption } from "../../../youtube-api/youtube-api.types.js";
import { Logger } from "../../../_common/logger/logger.js";
import { writeFileSync } from "fs";

type TokenOccurrence = {
  token: string;
  startTime: number;
  endTime: number;
};

type SimilarityDiagnostics = {
  similarityScore: number;
  scoreAtZeroShift: number;
  scoreAtBestShift: number;
  shiftGain: number;
  bestShiftMs: number;
  isShiftedInTime: boolean;
  manualTokenCount: number;
  autoTokenCount: number;
  stats: {
    zeroShift: MatchStats;
    bestShift: MatchStats;
    topUnmatchedTokensAtZeroShift: Array<{ token: string; count: number }>;
    topTimingMissTokensAtZeroShift: Array<{ token: string; count: number }>;
  };
};

type MatchStats = {
  totalTokens: number;
  matchedTokens: number;
  missingTokenInAutoCount: number;
  timingMissCount: number;
  matchRate: number;
};

const SHIFT_SCAN_MIN_MS = -5000;
const SHIFT_SCAN_MAX_MS = 5000;
const SHIFT_SCAN_STEP_MS = 500;
const TIME_TOLERANCE_MS = 1000;
const MAX_ALLOWED_SHIFT_MS = 1_200;
const MIN_SHIFT_GAIN_TO_FLAG = 0.08;

// High-frequency words add noise in matching because they appear everywhere.
const STOP_TOKENS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "but",
  "by",
  "for",
  "from",
  "i",
  "in",
  "is",
  "it",
  "its",
  "of",
  "on",
  "or",
  "that",
  "the",
  "their",
  "there",
  "they",
  "this",
  "to",
  "was",
  "we",
  "with",
  "you",
]);

const TEXT_REPLACEMENTS: Array<{ from: RegExp; to: string }> = [
  { from: /\bwe're\b/g, to: "we are" },
  { from: /\bi'm\b/g, to: "i am" },
  { from: /\bthey're\b/g, to: "they are" },
  { from: /\bdon't\b/g, to: "do not" },
  { from: /\bcan't\b/g, to: "cannot" },
  { from: /\bwon't\b/g, to: "will not" },
  { from: /\bgonna\b/g, to: "going to" },
  { from: /\bwanna\b/g, to: "want to" },
  { from: /\bgotta\b/g, to: "got to" },
  { from: /\bkinda\b/g, to: "kind of" },
  { from: /\bsorta\b/g, to: "sort of" },
];

@injectable()
export class CaptionsSimilarityService {
  constructor(private readonly logger: Logger) { }

  async calculateSimilarity({
    manualCaptions,
    autoCaptions,
  }: {
    manualCaptions: Caption[];
    autoCaptions: Caption[];
  }): Promise<SimilarityDiagnostics> {
    const manualTokenOccurrences = this.toTokenOccurrences(manualCaptions);
    const autoTokenOccurrences = this.toTokenOccurrences(autoCaptions);

    if (manualTokenOccurrences.length === 0 || autoTokenOccurrences.length === 0) {
      return {
        similarityScore: 0,
        scoreAtZeroShift: 0,
        scoreAtBestShift: 0,
        shiftGain: 0,
        bestShiftMs: 0,
        isShiftedInTime: false,
        manualTokenCount: manualTokenOccurrences.length,
        autoTokenCount: autoTokenOccurrences.length,
        stats: {
          zeroShift: {
            totalTokens: manualTokenOccurrences.length,
            matchedTokens: 0,
            missingTokenInAutoCount: 0,
            timingMissCount: 0,
            matchRate: 0,
          },
          bestShift: {
            totalTokens: manualTokenOccurrences.length,
            matchedTokens: 0,
            missingTokenInAutoCount: 0,
            timingMissCount: 0,
            matchRate: 0,
          },
          topUnmatchedTokensAtZeroShift: [],
          topTimingMissTokensAtZeroShift: [],
        },
      };
    }

    const autoTokenTimeIndex = this.buildTokenTimeIndex(autoTokenOccurrences);
    const zeroShiftDetails = this.calculateTokenMatchDetails({
      manualTokenOccurrences,
      autoTokenTimeIndex,
      shiftMs: 0,
    });
    writeFileSync("debug-manual-token-occurrences.json", JSON.stringify(manualTokenOccurrences));
    writeFileSync("debug-auto-token-occurrences.json", JSON.stringify(autoTokenOccurrences));
    const scoreAtZeroShift = zeroShiftDetails.matchRate;
    const bestShiftResult = this.findBestShift({
      manualTokenOccurrences,
      autoTokenTimeIndex,
    });
    const bestShiftDetails = this.calculateTokenMatchDetails({
      manualTokenOccurrences,
      autoTokenTimeIndex,
      shiftMs: bestShiftResult.shiftMs,
    });

    const shiftGain = bestShiftDetails.matchRate - scoreAtZeroShift;
    const isShiftedInTime =
      Math.abs(bestShiftResult.shiftMs) > MAX_ALLOWED_SHIFT_MS &&
      shiftGain >= MIN_SHIFT_GAIN_TO_FLAG;
    const similarityScore = isShiftedInTime ? Math.max(0, scoreAtZeroShift - 0.25) : scoreAtZeroShift;

    if (isShiftedInTime) {
      this.logger.warn(
        "Manual captions seem shifted in time compared to auto captions. " +
        "bestShiftMs=" + bestShiftResult.shiftMs +
        ", scoreAtZeroShift=" + scoreAtZeroShift.toFixed(3) +
        "bestShiftMs=" + bestShiftResult.shiftMs +
        ", scoreAtZeroShift=" + scoreAtZeroShift.toFixed(3) +
        ", scoreAtBestShift=" + bestShiftResult.score.toFixed(3),
      );
    }

    // Log detailed misses for best shift
    console.log("=== Matching Details (Best Shift) ===");
    console.log(`Matched: ${bestShiftDetails.matchedTokens}/${bestShiftDetails.totalTokens} (${(bestShiftDetails.matchRate * 100).toFixed(1)}%)`);

    if (bestShiftDetails.unmatchedOccurrences.length > 0) {
      console.log("\n--- Top 10 Completely Missing Tokens (Not in Auto at all) ---");
      const counts = this.getTopTokenCounts(bestShiftDetails.unmatchedTokens, 10);
      for (const item of counts) {
        // Find first occurrence to get example time
        const example = bestShiftDetails.unmatchedOccurrences.find(t => t.token === item.token);
        console.log(`"${item.token}": ${item.count} occurrences. Example time: ${example ? (example.startTime / 1000).toFixed(2) : '?'}s`);
      }
    }

    if (bestShiftDetails.timingMissOccurrences.length > 0) {
      console.log("\n--- Top 10 Timing Mismatches (Exist in Auto but at wrong time) ---");
      const counts = this.getTopTokenCounts(bestShiftDetails.timingMissTokens, 10);
      for (const item of counts) {
        const example = bestShiftDetails.timingMissOccurrences.find(t => t.token === item.token);
        console.log(`"${item.token}": ${item.count} occurrences. Example time: ${example ? (example.startTime / 1000).toFixed(2) : '?'}s`);
      }
    }
    console.log("=====================================");

    return {
      similarityScore,
      scoreAtZeroShift,
      scoreAtBestShift: bestShiftDetails.matchRate,
      shiftGain,
      bestShiftMs: bestShiftResult.shiftMs,
      isShiftedInTime,
      manualTokenCount: manualTokenOccurrences.length,
      autoTokenCount: autoTokenOccurrences.length,
      stats: {
        zeroShift: {
          totalTokens: zeroShiftDetails.totalTokens,
          matchedTokens: zeroShiftDetails.matchedTokens,
          missingTokenInAutoCount: zeroShiftDetails.missingTokenInAutoCount,
          timingMissCount: zeroShiftDetails.timingMissCount,
          matchRate: zeroShiftDetails.matchRate,
        },
        bestShift: {
          totalTokens: bestShiftDetails.totalTokens,
          matchedTokens: bestShiftDetails.matchedTokens,
          missingTokenInAutoCount: bestShiftDetails.missingTokenInAutoCount,
          timingMissCount: bestShiftDetails.timingMissCount,
          matchRate: bestShiftDetails.matchRate,
        },
        topUnmatchedTokensAtZeroShift: this.getTopTokenCounts(
          zeroShiftDetails.unmatchedTokens,
        ),
        topTimingMissTokensAtZeroShift: this.getTopTokenCounts(
          zeroShiftDetails.timingMissTokens,
        ),
      },
    };
  }

  private findBestShift({
    manualTokenOccurrences,
    autoTokenTimeIndex,
  }: {
    manualTokenOccurrences: TokenOccurrence[];
    autoTokenTimeIndex: Map<string, Array<{ startTime: number; endTime: number }>>;
  }): { shiftMs: number; score: number } {
    let bestShiftMs = 0;
    let bestScore = -1;

    for (
      let shiftMs = SHIFT_SCAN_MIN_MS;
      shiftMs <= SHIFT_SCAN_MAX_MS;
      shiftMs += SHIFT_SCAN_STEP_MS
    ) {
      const score = this.calculateTokenMatchDetails({
        manualTokenOccurrences,
        autoTokenTimeIndex,
        shiftMs,
      }).matchRate;

      if (score > bestScore) {
        bestScore = score;
        bestShiftMs = shiftMs;
      }
    }

    return {
      shiftMs: bestShiftMs,
      score: bestScore,
    };
  }

  private calculateTokenMatchDetails({
    manualTokenOccurrences,
    autoTokenTimeIndex,
    shiftMs,
  }: {
    manualTokenOccurrences: TokenOccurrence[];
    autoTokenTimeIndex: Map<string, Array<{ startTime: number; endTime: number }>>;
    shiftMs: number;
  }): MatchStats & {
    unmatchedTokens: string[];
    timingMissTokens: string[];
    unmatchedOccurrences: TokenOccurrence[];
    timingMissOccurrences: TokenOccurrence[];
  } {
    let matchedTokens = 0;
    let missingTokenInAutoCount = 0;
    let timingMissCount = 0;
    const unmatchedTokens: string[] = [];
    const timingMissTokens: string[] = [];
    const unmatchedOccurrences: TokenOccurrence[] = [];
    const timingMissOccurrences: TokenOccurrence[] = [];

    for (const manualOccurrence of manualTokenOccurrences) {
      const autoRanges = autoTokenTimeIndex.get(manualOccurrence.token);

      if (!autoRanges || autoRanges.length === 0) {
        missingTokenInAutoCount++;
        unmatchedTokens.push(manualOccurrence.token);
        unmatchedOccurrences.push(manualOccurrence);
        continue;
      }

      const targetStart = manualOccurrence.startTime - shiftMs - TIME_TOLERANCE_MS;
      const targetEnd = manualOccurrence.endTime - shiftMs + TIME_TOLERANCE_MS;

      const hasMatch = autoRanges.some(
        (autoRange) =>
          autoRange.endTime >= targetStart && autoRange.startTime <= targetEnd,
      );

      if (hasMatch) {
        matchedTokens++;
      } else {
        timingMissCount++;
        timingMissTokens.push(manualOccurrence.token);
        timingMissOccurrences.push(manualOccurrence);
      }
    }

    const totalTokens = manualTokenOccurrences.length;
    return {
      totalTokens,
      matchedTokens,
      missingTokenInAutoCount,
      timingMissCount,
      matchRate: matchedTokens / totalTokens,
      unmatchedTokens,
      timingMissTokens,
      unmatchedOccurrences,
      timingMissOccurrences,
    };
  }

  private getTopTokenCounts(
    tokens: string[],
    limit: number = 10,
  ): Array<{ token: string; count: number }> {
    const counts = new Map<string, number>();

    for (const token of tokens) {
      counts.set(token, (counts.get(token) ?? 0) + 1);
    }

    return Array.from(counts.entries())
      .map(([token, count]) => ({ token, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);
  }

  private buildTokenTimeIndex(
    tokenOccurrences: TokenOccurrence[],
  ): Map<string, Array<{ startTime: number; endTime: number }>> {
    const index = new Map<string, Array<{ startTime: number; endTime: number }>>();

    for (const occurrence of tokenOccurrences) {
      const ranges = index.get(occurrence.token);
      const range = {
        startTime: occurrence.startTime,
        endTime: occurrence.endTime,
      };

      if (!ranges) {
        index.set(occurrence.token, [range]);
        continue;
      }

      ranges.push(range);
    }

    return index;
  }

  private toTokenOccurrences(captions: Caption[]): TokenOccurrence[] {
    const tokenOccurrences: TokenOccurrence[] = [];

    for (const caption of captions) {
      const normalizedText = this.normalizeText(caption.text);
      const tokens = normalizedText
        .split(" ")
        .map((token) => token.trim())
        .filter((token) => token.length >= 2 && !STOP_TOKENS.has(token));

      for (const token of tokens) {
        tokenOccurrences.push({
          token,
          startTime: caption.startTime,
          endTime: caption.endTime,
        });
      }
    }

    return tokenOccurrences;
  }

  private normalizeText(text: string): string {
    let normalizedText = text.toLowerCase();

    for (const replacement of TEXT_REPLACEMENTS) {
      normalizedText = normalizedText.replace(replacement.from, replacement.to);
    }

    normalizedText = normalizedText
      .replace(/[^a-z0-9\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    return normalizedText;
  }
}