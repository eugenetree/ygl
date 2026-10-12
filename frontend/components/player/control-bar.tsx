"use client";

import { useId } from "react";
import { usePlayback, usePlaybackTime } from "@/components/player/playback";
import { formatSpeed, SPEEDS } from "@/components/player/playback-speed";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";
import { formatVideoTime } from "@/lib/time";

const secondaryButton =
  "h-[34px] rounded-md bg-surface px-3 hover:bg-tint dark:bg-surface dark:hover:bg-tint";

/** The control bar of the side-list layout. */
export function ControlBar({ speed }: { speed?: React.ReactNode }) {
  return (
    <div className="@container flex flex-wrap items-center gap-1.5 border-t px-3 py-2.5">
      <PreviousButton />
      <PlayPauseButton />
      <NextButton />
      <span aria-hidden className="mx-1.5 h-5 w-px bg-border" />
      <LoopSwitch />
      {speed}
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
        Loop<span className="@max-[34rem]:sr-only"> caption</span>
      </label>
    </div>
  );
}

export function SpeedMenu() {
  const {
    state: { speed },
    actions: { setSpeed },
  } = usePlayback();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          aria-label={`Speed ${formatSpeed(speed)}`}
          className={`${secondaryButton} min-w-11 px-2 font-mono text-xs`}
        >
          {formatSpeed(speed)}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="w-auto min-w-32 border bg-surface shadow-pop ring-0"
      >
        <DropdownMenuLabel className="px-2 py-1.5">Speed</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={String(speed)}
          onValueChange={(value) => setSpeed(Number(value))}
        >
          {SPEEDS.map((option) => (
            <DropdownMenuRadioItem
              key={option}
              value={String(option)}
              className="rounded-sm py-[7px] pl-2 font-mono text-[13px] focus:bg-tint"
            >
              {formatSpeed(option)}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function PlaybackTime() {
  return (
    <span className="ml-auto font-mono text-xs whitespace-nowrap text-muted-foreground tabular-nums">
      {formatVideoTime(usePlaybackTime())}
    </span>
  );
}
