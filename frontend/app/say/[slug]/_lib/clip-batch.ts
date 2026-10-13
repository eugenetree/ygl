import type {
  MAX_SEARCH_WINDOW as API_SEARCH_WINDOW,
  Clip,
  SearchResponse,
} from "@api/contract";
import { highlight, type TextPart } from "@/app/say/[slug]/_lib/highlight";

export const SEARCH_BATCH_SIZE = 20;

// A value import would pull zod into the bundle; the type keeps it in step.
const MAX_SEARCH_WINDOW: typeof API_SEARCH_WINDOW = 10000;

export type HighlightedClip = Clip & { textParts: TextPart[] };

export type ClipBatch = Omit<SearchResponse, "clips"> & {
  clips: HighlightedClip[];
};

export function toClipBatch(
  response: SearchResponse,
  queryWords: readonly string[],
): ClipBatch {
  return {
    ...response,
    clips: response.clips.map((clip) => ({
      ...clip,
      textParts: highlight(clip.text, queryWords),
    })),
  };
}

/** The offset of the batch after the one at `offset`, if there is one. */
export function nextBatchOffset(
  batch: ClipBatch,
  offset: number,
): number | undefined {
  // Not offset + clips.length: the API may drop clips from a batch.
  const next = offset + SEARCH_BATCH_SIZE;
  return next < Math.min(batch.total, MAX_SEARCH_WINDOW) ? next : undefined;
}

/**
 * The batch at `offset` from the API at `origin`: the browser's own by
 * default, which is the site's (ADR-0008).
 */
export async function fetchClipBatch(
  query: string,
  offset: number,
  { origin = "", ...init }: RequestInit & { origin?: string },
): Promise<SearchResponse> {
  const params = new URLSearchParams({
    q: query,
    offset: String(offset),
    limit: String(Math.min(SEARCH_BATCH_SIZE, MAX_SEARCH_WINDOW - offset)),
  });
  const response = await fetch(`${origin}/api/search?${params}`, init);
  if (!response.ok) throw new Error(`Search failed with ${response.status}`);
  return response.json();
}

export function formatTotal(total: number, isTotalExact: boolean): string {
  return total.toLocaleString("en-US") + (isTotalExact ? "" : "+");
}
