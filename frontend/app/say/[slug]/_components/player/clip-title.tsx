"use client";

import { useClipPosition } from "@/app/say/[slug]/_components/player/clip-position";
import { usePlayback } from "@/app/say/[slug]/_components/player/playback";

/** The playing clip's video title and channel name, and where it sits in the search. */
export function ClipTitle() {
  const {
    state: { currentClip },
  } = usePlayback();
  const { number, total } = useClipPosition();

  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
      <div className="flex min-w-0 flex-col gap-0.5">
        <p className="text-lg leading-6 font-semibold tracking-[-0.01em]">
          {currentClip.video.title}
        </p>
        <p className="text-muted-foreground">
          {currentClip.video.channel.name}
        </p>
      </div>
      <p className="font-mono text-[13px] whitespace-nowrap text-muted-foreground">
        <b className="font-medium text-foreground">{number}</b> of {total}
      </p>
    </div>
  );
}
