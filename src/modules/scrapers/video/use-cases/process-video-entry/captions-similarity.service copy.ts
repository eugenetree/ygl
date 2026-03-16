import { injectable } from "inversify";
import { CaptionCleanUpService } from "./caption-clean-up.service.js";
import { writeFileSync } from "fs";
import { Logger } from "../../../../_common/logger/logger.js";
import { Caption } from "../../../../youtube-api/youtube-api.types.js";
import { CaptionProps } from "../../caption.js";
import { CaptionSegment } from "./caption-analysis.service.js";

type TokenOccurrence = {
  token: string;
  startTime: number;
  endTime: number;
};

type SimilarityResult = {
  score: number;
  shiftMs: number;
  missingTokens: TokenOccurrence[];   // in manual but absent from auto entirely
  timingMissTokens: TokenOccurrence[]; // in manual, exists in auto but wrong time
  manualTokenCount: number;
  autoTokenCount: number;
};

const SHIFT_SCAN_MIN_MS = -3000;
const SHIFT_SCAN_MAX_MS = 3000;
const SHIFT_SCAN_STEP_MS = 500;
const TIME_TOLERANCE_MS = 1000;
const FUZZY_WINDOW_MS = 3000;  // ±3s window for fuzzy candidate lookup
const FUZZY_THRESHOLD = 70;   // Levenshtein ratio (0-100) to count as a match

// Minimum token length — single and two-letter words are too ambiguous for
// timing-sensitive matching and skew the shift detection.
const MIN_TOKEN_LENGTH = 3;

// High-frequency words add noise in matching because they appear everywhere.
const STOP_TOKENS = new Set([
  "a",
  "ah",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "but",
  "by",
  "do",
  "er",
  "for",
  "from",
  "he",
  "her",
  "him",
  "his",
  "i",
  "if",
  "in",
  "is",
  "it",
  "its",
  "me",
  "my",
  "no",
  "not",
  "of",
  "oh",
  "ok",
  "on",
  "or",
  "our",
  "so",
  "that",
  "the",
  "their",
  "there",
  "they",
  "this",
  "to",
  "um",
  "uh",
  "up",
  "us",
  "was",
  "we",
  "with",
  "yes",
  "you",
]);

function levenshteinRatio(a: string, b: string): number {
  const n = a.length;
  const m = b.length;
  if (n === 0 && m === 0) return 100;
  if (n === 0 || m === 0) return 0;
  if (Math.abs(n - m) > Math.max(n, m) * 0.5) return 0;

  const dp = Array.from({ length: n + 1 }, (_, i) => i);
  for (let j = 1; j <= m; j++) {
    let prev = dp[0];
    dp[0] = j;
    for (let i = 1; i <= n; i++) {
      const tmp = dp[i];
      dp[i] = a[i - 1] === b[j - 1] ? prev : 1 + Math.min(prev, dp[i], dp[i - 1]);
      prev = tmp;
    }
  }
  return Math.round((1 - dp[n] / Math.max(n, m)) * 100);
}

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
export class CaptionSimilarityService {
  constructor(
    private readonly logger: Logger,
    private readonly captionCleanUpService: CaptionCleanUpService,
  ) { }

  async calculateSimilarity({
    manualCaptions,
    autoCaptions,
  }: {
    manualCaptions: CaptionSegment[];
    autoCaptions: CaptionSegment[];
  }): Promise<SimilarityResult> {
    const manualNormalized = manualCaptions;
    const autoNormalized = autoCaptions;

    const manualOccurrences = this.toTokenOccurrences(manualNormalized);
    const autoOccurrences = this.toTokenOccurrences(autoNormalized);

    if (manualOccurrences.length === 0 || autoOccurrences.length === 0) {
      return {
        score: 0,
        shiftMs: 0,
        missingTokens: [],
        timingMissTokens: [],
        manualTokenCount: manualOccurrences.length,
        autoTokenCount: autoOccurrences.length,
      };
    }

    const autoTokenTimeIndex = this.buildTokenTimeIndex(autoOccurrences);
    const autoSorted = [...autoOccurrences].sort((a, b) => a.startTime - b.startTime);

    // Find the global time shift that maximises manual→auto recall
    const bestShift = this.findBestShift({
      manualOccurrences,
      autoTokenTimeIndex,
    });

    // Score manual→auto with the best shift
    const details = this.calculateMatchDetails({
      manualOccurrences,
      autoTokenTimeIndex,
      autoSorted,
      shiftMs: bestShift.shiftMs,
      useFuzzy: true,
    });

    if (Math.abs(bestShift.shiftMs) > 2000) {
      this.logger.warn(
        "Manual captions appear time-shifted relative to auto captions." +
        " shiftMs=" + bestShift.shiftMs +
        ", score=" + details.matchRate.toFixed(3),
      );
    }

    const topMissing = this.getTopTokenCounts(details.missingOccurrences.map(t => t.token), 5)
      .map(t => t.token).join(", ");
    const topTimingMiss = this.getTopTokenCounts(details.timingMissOccurrences.map(t => t.token), 5)
      .map(t => t.token).join(", ");

    this.logger.info(
      `Similarity: ${(details.matchRate * 100).toFixed(1)}%` +
      `, shiftMs=${bestShift.shiftMs}` +
      `, manualTokens=${manualOccurrences.length}, autoTokens=${autoOccurrences.length}` +
      (topMissing ? `, missingInAuto=[${topMissing}]` : "") +
      (topTimingMiss ? `, timingMiss=[${topTimingMiss}]` : ""),
    );

    return {
      score: details.matchRate,
      shiftMs: bestShift.shiftMs,
      missingTokens: details.missingOccurrences,
      timingMissTokens: details.timingMissOccurrences,
      manualTokenCount: manualOccurrences.length,
      autoTokenCount: autoOccurrences.length,
    };
  }

  private findBestShift({
    manualOccurrences,
    autoTokenTimeIndex,
  }: {
    manualOccurrences: TokenOccurrence[];
    autoTokenTimeIndex: Map<string, Array<{ startTime: number; endTime: number }>>;
  }): { shiftMs: number; score: number } {
    // Use only tokens that appear exactly once in both tracks as "anchors".
    // These rare tokens give a clean, unambiguous time delta unaffected by
    // rolling-window duplicates or high-frequency repeating words.
    const manualCounts = new Map<string, number>();
    for (const occ of manualOccurrences) {
      manualCounts.set(occ.token, (manualCounts.get(occ.token) ?? 0) + 1);
    }

    const deltaCounts = new Map<number, number>();
    const anchorsUsed: Array<{ token: string; delta: number }> = [];

    for (const manual of manualOccurrences) {
      // Skip tokens that appear more than once in manual (ambiguous)
      if ((manualCounts.get(manual.token) ?? 0) > 1) continue;

      const autoRanges = autoTokenTimeIndex.get(manual.token);
      // Skip tokens absent from auto or appearing more than once in auto
      if (!autoRanges || autoRanges.length !== 1) continue;

      const manualMid = (manual.startTime + manual.endTime) / 2;
      const autoMid = (autoRanges[0].startTime + autoRanges[0].endTime) / 2;
      const delta = autoMid - manualMid;

      if (delta < SHIFT_SCAN_MIN_MS || delta > SHIFT_SCAN_MAX_MS) continue;

      const bucket = Math.round(delta / SHIFT_SCAN_STEP_MS) * SHIFT_SCAN_STEP_MS;
      deltaCounts.set(bucket, (deltaCounts.get(bucket) ?? 0) + 1);
      anchorsUsed.push({ token: manual.token, delta });
    }

    console.log("debug: anchor delta histogram", [...deltaCounts.entries()].sort((a, b) => a[0] - b[0]));
    console.log("debug: anchors used", anchorsUsed.length);

    // Only commit to a non-zero shift if the winning bucket is clearly dominant:
    // it must hold at least 30 % of all anchor votes.  A genuine global offset
    // produces a sharp spike; segmentation noise produces a flat histogram.
    const totalAnchors = anchorsUsed.length;
    let bestShiftMs = 0;

    if (totalAnchors >= 5) {
      let bestVotes = 0;
      for (const [bucket, votes] of deltaCounts) {
        if (votes > bestVotes || (votes === bestVotes && Math.abs(bucket) < Math.abs(bestShiftMs))) {
          bestShiftMs = bucket;
          bestVotes = votes;
        }
      }

      const confidence = bestVotes / totalAnchors;
      console.log(`debug: best bucket=${bestShiftMs}ms votes=${bestVotes}/${totalAnchors} confidence=${(confidence * 100).toFixed(1)}%`);

      if (confidence < 0.30) {
        bestShiftMs = 0;
      }
    }

    const bestScore = this.calculateMatchDetails({
      manualOccurrences,
      autoTokenTimeIndex,
      autoSorted: [],
      shiftMs: bestShiftMs,
      useFuzzy: false,
    }).matchRate;

    return { shiftMs: bestShiftMs, score: bestScore };
  }

  private calculateMatchDetails({
    manualOccurrences,
    autoTokenTimeIndex,
    autoSorted,
    shiftMs,
    useFuzzy,
  }: {
    manualOccurrences: TokenOccurrence[];
    autoTokenTimeIndex: Map<string, Array<{ startTime: number; endTime: number }>>;
    autoSorted: TokenOccurrence[];
    shiftMs: number;
    useFuzzy: boolean;
  }): {
    matchedCount: number;
    matchRate: number;
    missingOccurrences: TokenOccurrence[];
    timingMissOccurrences: TokenOccurrence[];
  } {
    let matchedCount = 0;
    const missingOccurrences: TokenOccurrence[] = [];
    const timingMissOccurrences: TokenOccurrence[] = [];

    for (const manual of manualOccurrences) {
      const targetStart = manual.startTime + shiftMs - TIME_TOLERANCE_MS;
      const targetEnd = manual.endTime + shiftMs + TIME_TOLERANCE_MS;

      // 1. Exact token match via index (fast path)
      const autoRanges = autoTokenTimeIndex.get(manual.token);

      if (autoRanges && autoRanges.length > 0) {
        const hasTimeMatch = autoRanges.some(
          r => r.endTime >= targetStart && r.startTime <= targetEnd,
        );

        if (hasTimeMatch) {
          matchedCount++;
          continue;
        }

        // Token exists in auto but only at wrong time — timing miss, skip fuzzy
        timingMissOccurrences.push(manual);
        continue;
      }

      // 2. Token absent from auto entirely — try fuzzy within ±FUZZY_WINDOW_MS
      if (useFuzzy) {
        const fuzzyStart = manual.startTime + shiftMs - FUZZY_WINDOW_MS;
        const fuzzyEnd = manual.endTime + shiftMs + FUZZY_WINDOW_MS;

        const candidates = this.getOccurrencesInRange(autoSorted, fuzzyStart, fuzzyEnd);
        const fuzzyMatched = candidates.some(
          cand => {
            const ratio = levenshteinRatio(manual.token, cand.token);
            return ratio >= FUZZY_THRESHOLD;
          },
        );

        if (fuzzyMatched) {
          matchedCount++;
          continue;
        }
      }

      missingOccurrences.push(manual);
    }

    return {
      matchedCount,
      matchRate: matchedCount / manualOccurrences.length,
      missingOccurrences,
      timingMissOccurrences,
    };
  }

  /**
   * Returns all occurrences from a startTime-sorted array whose startTime falls
   * within [windowStart, windowEnd]. Uses binary search to find the left bound.
   */
  private getOccurrencesInRange(
    sorted: TokenOccurrence[],
    windowStart: number,
    windowEnd: number,
  ): TokenOccurrence[] {
    let lo = 0;
    let hi = sorted.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (sorted[mid].startTime < windowStart) lo = mid + 1;
      else hi = mid;
    }

    const result: TokenOccurrence[] = [];
    for (let i = lo; i < sorted.length && sorted[i].startTime <= windowEnd; i++) {
      result.push(sorted[i]);
    }
    return result;
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
    for (const occ of tokenOccurrences) {
      const ranges = index.get(occ.token);
      const range = { startTime: occ.startTime, endTime: occ.endTime };
      if (!ranges) {
        index.set(occ.token, [range]);
      } else {
        ranges.push(range);
      }
    }
    return index;
  }

  private toTokenOccurrences(captions: Caption[]): TokenOccurrence[] {
    const tokenOccurrences: TokenOccurrence[] = [];
    for (const caption of captions) {
      const normalizedText = this.normalizeText(caption.text);
      const tokens = normalizedText
        .split(" ")
        .map(token => token.trim())
        .filter(token => token.length >= MIN_TOKEN_LENGTH && !STOP_TOKENS.has(token));

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
    let normalizedText = text
      // Remove speaker labels (e.g., "Sapnap:", "George:")
      .replace(/(^|[\s.!?])([A-Za-z][A-Za-z0-9_' -]{0,19}:\s*)/g, '$1')
      // Remove sound effects in brackets/asterisks (e.g., [laughter], *music*)
      .replace(/\[.*?\]/g, '')
      .replace(/\*[^*]+\*/g, '')
      .toLowerCase();

    for (const replacement of TEXT_REPLACEMENTS) {
      normalizedText = normalizedText.replace(replacement.from, replacement.to);
    }

    return normalizedText
      .replace(/[^a-z0-9\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }
}