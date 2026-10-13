"use client";

import {
  usePlayback,
  usePlaybackTime,
} from "@/app/say/[slug]/_components/player/playback";
import { clipProgress } from "@/app/say/[slug]/_lib/clip-loop";

export function ClipProgress() {
  const {
    state: { currentClip },
  } = usePlayback();
  const progress = clipProgress(currentClip, usePlaybackTime());

  return (
    <div
      role="progressbar"
      aria-label="Clip progress"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(progress * 100)}
      className="h-0.5 bg-soft"
    >
      <div
        className="h-full origin-left bg-primary transition-transform duration-300 ease-linear"
        style={{ transform: `scaleX(${progress})` }}
      />
    </div>
  );
}
