import { type InfiniteData, useInfiniteQuery } from "@tanstack/react-query";
import { useCallback } from "react";
import { toast } from "sonner";
import {
  type ClipBatch,
  fetchClipBatch,
  type HighlightedClip,
  nextBatchOffset,
  toClipBatch,
} from "@/lib/clip-batch";

export type SearchClips = {
  clips: HighlightedClip[];
  total: number;
  isTotalExact: boolean;
  batchCount: number;
};

function selectClips(data: InfiniteData<ClipBatch, number>): SearchClips {
  const seen = new Set<string>();
  const clips = data.pages
    .flatMap((batch) => batch.clips)
    .filter((clip) => !seen.has(clip.captionId) && seen.add(clip.captionId));
  const last = data.pages[data.pages.length - 1];
  return {
    clips,
    total: last.total,
    isTotalExact: last.isTotalExact,
    batchCount: data.pages.length,
  };
}

/**
 * A search's clips, batch by batch. The server's first batch is the first
 * page, so loading a search page doesn't fetch it again.
 */
export function useSearchClips({
  query,
  queryWords,
  firstBatch,
}: {
  query: string;
  /** The query's words as the server segments them (see lib/highlight). */
  queryWords: readonly string[];
  firstBatch: ClipBatch;
}) {
  const { data, hasNextPage, isFetchingNextPage, fetchNextPage } =
    useInfiniteQuery({
      queryKey: ["search", query],
      queryFn: async ({ pageParam, signal }) =>
        toClipBatch(await fetchClipBatch(query, pageParam, signal), queryWords),
      initialPageParam: 0,
      getNextPageParam: (lastBatch, _batches, lastOffset) =>
        nextBatchOffset(lastBatch, lastOffset),
      initialData: { pages: [firstBatch], pageParams: [0] },
      // Any staleTime short of this would refetch the seeded batch on mount,
      // and every loaded batch on window focus.
      staleTime: Number.POSITIVE_INFINITY,
      // The listener retries by asking again, so a failure is reported quickly.
      retry: 1,
      select: selectClips,
    });

  /**
   * Loads the next batch, or joins the load already under way. Resolves to
   * the clips after it, or null when it failed.
   */
  const loadMore = useCallback(async (): Promise<SearchClips | null> => {
    const result = await fetchNextPage({ cancelRefetch: false });
    if (result.isFetchNextPageError || !result.data) {
      toast("Couldn't load more clips", { id: "clip-batch-failed" });
      return null;
    }
    return result.data;
  }, [fetchNextPage]);

  return { search: data, hasNextPage, isFetchingNextPage, loadMore };
}
