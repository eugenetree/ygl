"use client";

import { ArrowLeftIcon, ArrowRightIcon } from "lucide-react";
import { usePlayback } from "@/components/player/playback";
import { useShortcuts } from "@/lib/use-shortcuts";

/** The playback keys. Renders nothing. */
export function PlaybackShortcuts() {
  const {
    state: { isLooping },
    actions,
  } = usePlayback();
  useShortcuts({
    " ": actions.togglePlay,
    k: actions.togglePlay,
    ArrowLeft: actions.previous,
    p: actions.previous,
    ArrowRight: actions.next,
    n: actions.next,
    l: () => actions.setLooping(!isLooping),
    r: actions.replay,
    s: actions.cycleSpeed,
  });
  return null;
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex h-[18px] items-center rounded-sm border bg-kbd px-[5px] font-mono font-medium text-foreground [&_svg]:size-3">
      {children}
    </kbd>
  );
}

const HINTS: { keys: React.ReactNode; label: string }[] = [
  { keys: <Kbd>Space</Kbd>, label: "Play/pause" },
  {
    keys: (
      <>
        <Kbd>
          <ArrowLeftIcon aria-label="Left arrow" />
        </Kbd>
        <Kbd>
          <ArrowRightIcon aria-label="Right arrow" />
        </Kbd>
      </>
    ),
    label: "Prev/next",
  },
  { keys: <Kbd>L</Kbd>, label: "Loop" },
  { keys: <Kbd>R</Kbd>, label: "Replay" },
  { keys: <Kbd>S</Kbd>, label: "Speed" },
];

/**
 * The keys' hints, in one line. Hints that don't fit the line are cut off,
 * last first.
 */
export function ShortcutHints() {
  return (
    <ul
      aria-label="Keyboard shortcuts"
      className="flex h-[18px] flex-wrap gap-x-4 overflow-hidden text-xs text-muted-foreground"
    >
      {HINTS.map(({ keys, label }) => (
        <li key={label} className="flex items-center gap-1.5 whitespace-nowrap">
          {keys}
          {label}
        </li>
      ))}
    </ul>
  );
}
