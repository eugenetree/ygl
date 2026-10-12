"use client";

import { ClipRow } from "@/components/search/clip-row";
import {
  type SearchClips,
  useSearchClips,
} from "@/components/search/use-search-clips";
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
  const { data, hasNextPage } = useSearchClips({
    query,
    queryWords,
    firstBatch,
  });

  return (
    <section>
      <header className="flex flex-col gap-0.5 px-1 pt-1 pb-2.5">
        <h1 className="text-[17px] leading-[1.3] font-semibold">
          How to pronounce “{query}”
        </h1>
        <p className="text-[13px] text-muted-foreground">
          {countLine(data, hasNextPage)}
        </p>
      </header>
      <ol className="flex flex-col gap-0.5">
        {data.clips.map((clip, index) => (
          <li key={clip.captionId}>
            <ClipRow clip={clip} number={index + 1} />
          </li>
        ))}
      </ol>
    </section>
  );
}

function countLine(
  { clips, total, isTotalExact, batchCount }: SearchClips,
  hasMore: boolean,
): string {
  const loaded = clips.length.toLocaleString("en-US");
  if (hasMore) {
    return `First ${loaded} of ${formatTotal(total, isTotalExact)} clips`;
  }
  const all = `${loaded} ${clips.length === 1 ? "clip" : "clips"}`;
  return batchCount === 1 ? all : `All ${all}`;
}
