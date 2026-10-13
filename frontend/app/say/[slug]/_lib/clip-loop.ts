import type { Clip } from "@api/contract";

// Polls arrive late, especially in background tabs, so playback may move
// somewhat further than the wall clock predicts without anyone seeking.
const SEEK_SLACK_MS = 750;

/**
 * Whether playback moving from `fromMs` to `toMs` crossed the end of the
 * clip's caption from inside the clip by playing on, rather than by the
 * listener seeking out of it. `expectedAdvanceMs` is how far it should have
 * moved at its rate since the previous poll.
 */
export function playedPastClipEnd(
  clip: Pick<Clip, "playFrom" | "endTime">,
  fromMs: number,
  toMs: number,
  expectedAdvanceMs: number,
): boolean {
  const wasInside = fromMs >= clip.playFrom && fromMs < clip.endTime;
  return (
    wasInside &&
    toMs >= clip.endTime &&
    toMs - fromMs <= expectedAdvanceMs + SEEK_SLACK_MS
  );
}

/** How far through the clip `timeMs` is, from 0 to 1, full past its end. */
export function clipProgress(
  clip: Pick<Clip, "playFrom" | "endTime">,
  timeMs: number,
): number {
  const length = clip.endTime - clip.playFrom;
  if (length <= 0) return 1;
  return Math.min(1, Math.max(0, (timeMs - clip.playFrom) / length));
}
