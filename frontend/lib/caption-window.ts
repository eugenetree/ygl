import type { Clip, VideoCaption } from "@api/contract";

export type CaptionWindow = {
  before?: VideoCaption;
  current: VideoCaption;
  after?: VideoCaption;
};

type WindowClip = Pick<
  Clip,
  "captionId" | "startTime" | "endTime" | "text" | "playFrom"
>;

// The player can start a little before the play-from point: its `start`
// is whole seconds and may land on an earlier keyframe.
const START_SLACK_MS = 2000;

// With Loop on, the time polled just past the end stays on screen until the
// next poll sees the jump back.
const LOOP_SLACK_MS = 1000;

/**
 * Whether `timeMs` belongs to the clip: from its lead-in to its caption's
 * end, where the card shows the clip's own line.
 */
export function isInClip(
  clip: WindowClip,
  timeMs: number,
  isLooping: boolean,
): boolean {
  const end = clip.endTime + (isLooping ? LOOP_SLACK_MS : 0);
  return timeMs >= clip.playFrom - START_SLACK_MS && timeMs < end;
}

/**
 * The caption being spoken at `timeMs`, with the ones before and after it.
 * Within the clip, that's the clip's caption, lead-in included. Elsewhere
 * it's the last caption to have started. Without the video's captions, or
 * when they don't hold the clip's, it's the clip's caption alone.
 */
export function captionWindow(
  captions: readonly VideoCaption[] | undefined,
  clip: WindowClip,
  timeMs: number,
  isLooping: boolean,
): CaptionWindow {
  const clipIndex =
    captions?.findIndex(({ captionId }) => captionId === clip.captionId) ?? -1;
  if (!captions || clipIndex === -1) return { current: clip };

  const index = isInClip(clip, timeMs, isLooping)
    ? clipIndex
    : Math.max(
        0,
        captions.findLastIndex(({ startTime }) => startTime <= timeMs),
      );
  return {
    before: captions[index - 1],
    current: captions[index],
    after: captions[index + 1],
  };
}
