"use client";

import { usePlayback } from "@/components/player/playback";
import { Button } from "@/components/ui/button";

type ButtonProps = Omit<
  React.ComponentProps<typeof Button>,
  "onClick" | "disabled"
>;

export function PreviousButton(props: ButtonProps) {
  const {
    state: { hasPrevious },
    actions: { previous },
  } = usePlayback();
  return (
    <Button
      variant="outline"
      disabled={!hasPrevious}
      onClick={previous}
      {...props}
    />
  );
}

export function NextButton(props: ButtonProps) {
  const {
    state: { hasNext },
    actions: { next },
  } = usePlayback();
  return (
    <Button variant="outline" disabled={!hasNext} onClick={next} {...props} />
  );
}

export function PlayPauseButton(props: Omit<ButtonProps, "children">) {
  const {
    state: { isPlaying },
    actions: { togglePlay },
  } = usePlayback();
  return (
    <Button onClick={togglePlay} {...props}>
      {isPlaying ? "Pause" : "Play"}
    </Button>
  );
}
