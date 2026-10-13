"use client";

import { usePlayback } from "@/app/say/[slug]/_components/player/playback";

/** The YouTube player's 16:9 frame. Moving it with CSS keeps the video playing. */
export function PlayerVideo() {
  const {
    state: { needsTap },
    meta: { playerRef },
  } = usePlayback();

  return (
    <div className="relative aspect-video bg-[repeating-linear-gradient(135deg,var(--soft)_0_10px,var(--soft-2)_10px_20px)]">
      <div
        ref={playerRef}
        className="absolute inset-0 [&_iframe]:block [&_iframe]:size-full"
      />
      {needsTap && (
        <p
          role="status"
          className="pointer-events-none absolute inset-x-0 bottom-3 mx-auto w-fit rounded-full bg-primary px-3 py-1.5 text-[13px] font-medium text-primary-foreground shadow-pop"
        >
          Tap the video to start
        </p>
      )}
    </div>
  );
}
