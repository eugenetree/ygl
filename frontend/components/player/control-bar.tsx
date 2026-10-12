"use client";

import { useId } from "react";
import { usePlayback, usePlaybackTime } from "@/components/player/playback";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { formatVideoTime } from "@/lib/time";

const secondaryButton =
  "h-[34px] rounded-md bg-surface px-3 hover:bg-tint dark:bg-surface dark:hover:bg-tint";

/** The control bar of the side-list layout. */
export function ControlBar() {
  return (
    <div className="flex flex-wrap items-center gap-1.5 border-t px-3 py-2.5">
      <PreviousButton />
      <PlayPauseButton />
      <NextButton />
      <span aria-hidden className="mx-1.5 h-5 w-px bg-border" />
      <LoopSwitch />
      <PlaybackTime />
    </div>
  );
}

export function PreviousButton() {
  const {
    state: { hasPrevious },
    actions: { previous },
  } = usePlayback();
  return (
    <Button
      variant="outline"
      className={secondaryButton}
      disabled={!hasPrevious}
      onClick={previous}
    >
      Previous
    </Button>
  );
}

export function NextButton() {
  const {
    state: { hasNext },
    actions: { next },
  } = usePlayback();
  return (
    <Button
      variant="outline"
      className={secondaryButton}
      disabled={!hasNext}
      onClick={next}
    >
      Next
    </Button>
  );
}

export function PlayPauseButton() {
  const {
    state: { isPlaying },
    actions: { togglePlay },
  } = usePlayback();
  return (
    <Button
      className="h-[34px] min-w-[84px] rounded-md px-3.5 hover:bg-primary hover:opacity-88"
      onClick={togglePlay}
    >
      {isPlaying ? "Pause" : "Play"}
    </Button>
  );
}

export function LoopSwitch() {
  const id = useId();
  const {
    state: { isLooping },
    actions: { setLooping },
  } = usePlayback();
  return (
    <div className="flex items-center gap-2">
      <Switch id={id} checked={isLooping} onCheckedChange={setLooping} />
      <label htmlFor={id} className="cursor-pointer font-medium select-none">
        Loop caption
      </label>
    </div>
  );
}

export function PlaybackTime() {
  return (
    <span className="ml-auto font-mono text-xs whitespace-nowrap text-muted-foreground tabular-nums">
      {formatVideoTime(usePlaybackTime())}
    </span>
  );
}
