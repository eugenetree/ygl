import "server-only";

import type { SearchResponse } from "@api/contract";
import { cache } from "react";
import { fetchClipBatch } from "@/app/say/[slug]/_lib/clip-batch";
import { apiUrl } from "@/lib/api-url";
import { decodeSegment, MAX_QUERY_LENGTH } from "@/lib/query";
import { slug, unslug } from "@/lib/slug";

export type SearchPage =
  | { status: "too-long" }
  | { status: "no-clips"; query: string; slug: string }
  | {
      status: "clips";
      query: string;
      slug: string;
      firstBatch: SearchResponse;
    };

/**
 * What `/say/{segment}` shows. React's cache and Next's fetch cache let the
 * page, its metadata and its preview image share one API call.
 */
export const getSearchPage = cache(
  async (segment: string): Promise<SearchPage> => {
    const search = readSearchSegment(segment);
    if (!search) return { status: "too-long" };
    if (!search.slug) return { status: "no-clips", ...search };

    const firstBatch = await getFirstBatch(search.query);
    if (firstBatch.clips.length === 0) {
      return { status: "no-clips", ...search };
    }
    return { status: "clips", ...search, firstBatch };
  },
);

/**
 * The search a `/say/{segment}` path names: its canonical slug read back
 * (ADR-0012), or null when that is too long to search.
 */
function readSearchSegment(
  segment: string,
): { query: string; slug: string } | null {
  const decoded = decodeSegment(segment);
  const canonicalSlug = slug(unslug(decoded));
  // A segment with no words, like "!!!", has nothing to read back.
  const query = canonicalSlug ? unslug(canonicalSlug) : decoded.trim();
  if (query.length > MAX_QUERY_LENGTH) return null;
  return { query, slug: canonicalSlug };
}

// Throwing on a failed search gives an uncached 500, and a cached page keeps
// its last good version when its refresh fails (ADR-0011).
const getFirstBatch = cache((query: string) =>
  fetchClipBatch(query, 0, {
    origin: apiUrl(),
    // Must stay cacheable: no-store here would make every search page dynamic.
    next: { revalidate: 3600 },
  }),
);
