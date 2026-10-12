"use client";

import { usePlayback } from "@/components/player/playback";
import { formatTotal } from "@/lib/clip-batch";

/** The playing clip's video title and channel name, and where it sits in the search. */
export function ClipTitle() {
  const {
    state: { currentClip, currentIndex, total, isTotalExact },
  } = usePlayback();

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
        <b className="font-medium text-foreground">
          {(currentIndex + 1).toLocaleString("en-US")}
        </b>{" "}
        of {formatTotal(total, isTotalExact)}
      </p>
    </div>
  );
}
