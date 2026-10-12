"use client";

import { ClipProgress } from "@/components/player/clip-progress";
import { ClipTitle } from "@/components/player/clip-title";
import { ControlBar } from "@/components/player/control-bar";
import { PlaybackProvider, usePlayback } from "@/components/player/playback";
import { PlayerVideo } from "@/components/player/player-video";
import { ClipRow } from "@/components/search/clip-row";
import type { SearchClips } from "@/components/search/use-search-clips";
import { type ClipBatch, formatTotal } from "@/lib/clip-batch";

export function SearchResults({
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
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-4 px-1">
          <ClipTitle />
          <div className="overflow-hidden rounded-xl border shadow-card">
            <PlayerVideo />
            <ClipProgress />
            <ControlBar />
          </div>
        </div>
        <ClipList query={query} />
      </div>
    </PlaybackProvider>
  );
}

function ClipList({ query }: { query: string }) {
  const {
    state,
    actions: { playClip },
  } = usePlayback();

  return (
    <section>
      <header className="flex flex-col gap-0.5 px-1 pt-1 pb-2.5">
        <h1 className="text-[17px] leading-[1.3] font-semibold">
          How to pronounce “{query}”
        </h1>
        <p className="text-[13px] text-muted-foreground">{countLine(state)}</p>
      </header>
      <ol className="flex flex-col gap-0.5">
        {state.clips.map((clip, index) => (
          <li key={clip.captionId}>
            <ClipRow
              clip={clip}
              number={index + 1}
              aria-current={index === state.currentIndex || undefined}
              onClick={() => playClip(index)}
            />
          </li>
        ))}
      </ol>
    </section>
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
  if (hasMoreClips) {
    return `First ${loaded} of ${formatTotal(total, isTotalExact)} clips`;
  }
  const all = `${loaded} ${clips.length === 1 ? "clip" : "clips"}`;
  return batchCount === 1 ? all : `All ${all}`;
}
