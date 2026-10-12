"use client";

import { ArrowLeftIcon, ArrowRightIcon, RepeatIcon } from "lucide-react";
import { ClipPosition } from "@/components/player/clip-position";
import { PlaybackTime } from "@/components/player/control-bar";
import { usePlayback } from "@/components/player/playback";
import { formatSpeed } from "@/components/player/playback-speed";
import { Button } from "@/components/ui/button";

const touchButton =
  "h-11 min-w-11 rounded-lg bg-surface hover:bg-tint dark:bg-surface dark:hover:bg-tint";

/**
 * The control bar of the sticky-player layout, with 44px buttons. On phones
 * the clip's place in the search sits under the time.
 */
export function TouchControlBar({ speed }: { speed?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1.5 px-3 py-2 sm:px-0 sm:py-2.5">
      <TouchPreviousButton />
      <TouchPlayPauseButton />
      <TouchNextButton />
      <LoopToggle />
      {speed}
      <div className="ml-auto flex min-w-0 flex-col items-end font-mono text-xs text-muted-foreground">
        <PlaybackTime />
        <ClipPosition
          separator="/"
          className="max-w-full truncate whitespace-nowrap sm:hidden"
        />
      </div>
    </div>
  );
}

function TouchPreviousButton() {
  const {
    state: { hasPrevious },
    actions: { previous },
  } = usePlayback();
  return (
    <Button
      variant="outline"
      className={touchButton}
      aria-label="Previous"
      disabled={!hasPrevious}
      onClick={previous}
    >
      <ArrowLeftIcon aria-hidden />
    </Button>
  );
}

function TouchNextButton() {
  const {
    state: { hasNext },
    actions: { next },
  } = usePlayback();
  return (
    <Button
      variant="outline"
      className={touchButton}
      aria-label="Next"
      disabled={!hasNext}
      onClick={next}
    >
      <ArrowRightIcon aria-hidden />
    </Button>
  );
}

function TouchPlayPauseButton() {
  const {
    state: { isPlaying },
    actions: { togglePlay },
  } = usePlayback();
  return (
    <Button
      className="h-11 min-w-[72px] rounded-lg px-3.5 hover:bg-primary hover:opacity-88 sm:min-w-[76px]"
      onClick={togglePlay}
    >
      {isPlaying ? "Pause" : "Play"}
    </Button>
  );
}

export function SpeedToggle() {
  const {
    state: { speed },
    actions: { cycleSpeed },
  } = usePlayback();
  return (
    <Button
      variant="outline"
      aria-label={`Speed ${formatSpeed(speed)}`}
      className={`${touchButton} px-2 font-mono text-[13px] font-normal`}
      onClick={cycleSpeed}
    >
      {formatSpeed(speed)}
    </Button>
  );
}

function LoopToggle() {
  const {
    state: { isLooping },
    actions: { setLooping },
  } = usePlayback();
  return (
    <Button
      variant="outline"
      className={`${touchButton} gap-1.5 px-2.5 text-[13px] font-normal text-faint aria-pressed:bg-soft aria-pressed:font-medium aria-pressed:text-foreground sm:px-3 dark:aria-pressed:bg-soft`}
      aria-pressed={isLooping}
      onClick={() => setLooping(!isLooping)}
    >
      <RepeatIcon aria-hidden />
      <span className="max-[374px]:sr-only">Loop</span>
    </Button>
  );
}
