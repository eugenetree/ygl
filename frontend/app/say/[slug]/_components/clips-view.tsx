"use client";

import { InHeader } from "@/app/say/_components/header-slot";
import { ClipRow } from "@/app/say/[slug]/_components/clip-row";
import {
  ClipsLayout,
  revealInList,
} from "@/app/say/[slug]/_components/clips-layout";
import { CaptionCard } from "@/app/say/[slug]/_components/player/caption-card";
import { ClipPosition } from "@/app/say/[slug]/_components/player/clip-position";
import { ClipProgress } from "@/app/say/[slug]/_components/player/clip-progress";
import { ClipTitle } from "@/app/say/[slug]/_components/player/clip-title";
import {
  ControlBar,
  SpeedMenu,
} from "@/app/say/[slug]/_components/player/control-bar";
import {
  PlaybackProvider,
  usePlayback,
} from "@/app/say/[slug]/_components/player/playback";
import {
  PlaybackShortcuts,
  ShortcutHints,
} from "@/app/say/[slug]/_components/player/playback-shortcuts";
import { PlayerVideo } from "@/app/say/[slug]/_components/player/player-video";
import {
  SpeedToggle,
  TouchControlBar,
} from "@/app/say/[slug]/_components/player/touch-control-bar";
import { type ClipBatch, formatTotal } from "@/app/say/[slug]/_lib/clip-batch";
import { pronounceHeading } from "@/app/say/[slug]/_lib/search-copy";
import type { SearchClips } from "@/app/say/[slug]/_lib/use-search-clips";
import { Button } from "@/components/ui/button";
import { useAccentSwitch } from "@/lib/accent";

export function ClipsView({
  query,
  queryWords,
  firstBatch,
}: {
  query: string;
  queryWords: readonly string[];
  firstBatch: ClipBatch;
}) {
  return (
    <PlaybackProvider
      query={query}
      queryWords={queryWords}
      firstBatch={firstBatch}
    >
      <PlaybackShortcuts />
      <RestartOnAccentSwitch />
      <InHeader>
        <ClipPosition
          separator=" / "
          className="mr-2.5 hidden font-mono text-xs whitespace-nowrap text-muted-foreground sm:inline side:hidden"
        />
      </InHeader>
      <ClipsLayout
        title={<ClipTitle />}
        video={
          <>
            <PlayerVideo />
            <ClipProgress />
          </>
        }
        controls={<ControlBar speed={<SpeedMenu />} />}
        touchControls={<TouchControlBar speed={<SpeedToggle />} />}
        caption={<CaptionCard queryWords={queryWords} />}
        shortcuts={<ShortcutHints />}
        heading={<ListHeading query={query} />}
        clips={<ClipItems />}
        more={<ShowMoreClips />}
      />
    </PlaybackProvider>
  );
}

// The clips don't depend on the accent yet, so the same ones play again.
function RestartOnAccentSwitch() {
  const { actions } = usePlayback();
  useAccentSwitch(() => actions.playClip(0));
  return null;
}

function ListHeading({ query }: { query: string }) {
  const { state } = usePlayback();
  return (
    <>
      <h1 className="text-base leading-[1.3] font-semibold sm:text-[17px]">
        {pronounceHeading(query)}
      </h1>
      <p className="text-xs text-muted-foreground sm:text-[13px]">
        {countLine(state)}
      </p>
    </>
  );
}

function ClipItems() {
  const {
    state: { clips, currentIndex },
    actions: { playClip },
  } = usePlayback();
  return clips.map((clip, index) => (
    <li
      key={clip.captionId}
      ref={index === currentIndex ? revealInList : undefined}
    >
      <ClipRow
        clip={clip}
        position={index + 1}
        aria-current={index === currentIndex || undefined}
        onClick={() => playClip(index)}
      />
    </li>
  ));
}

function ShowMoreClips() {
  const {
    state: { hasMoreClips, isLoadingMoreClips },
    actions: { showMoreClips },
  } = usePlayback();
  if (!hasMoreClips) return null;
  return (
    // Left enabled while loading: disabling it would drop its focus.
    <Button
      variant="outline"
      className="mt-2 h-10 w-full rounded-lg bg-surface hover:bg-tint dark:bg-surface dark:hover:bg-tint"
      aria-busy={isLoadingMoreClips}
      onClick={showMoreClips}
    >
      {isLoadingMoreClips ? "Loading clips…" : "Show more clips"}
    </Button>
  );
}

function countLine({
  clips,
  total,
  isTotalExact,
  batchCount,
  hasMoreClips,
}: SearchClips & { hasMoreClips: boolean }): string {
  const loaded = clips.length.toLocaleString("en-US");
  // Paging stops at 10,000 clips, short of a total that isn't exact.
  if (hasMoreClips || !isTotalExact) {
    return `First ${loaded} of ${formatTotal(total, isTotalExact)} clips`;
  }
  const all = `${loaded} ${clips.length === 1 ? "clip" : "clips"}`;
  return batchCount === 1 ? all : `All ${all}`;
}
