import type { Metadata } from "next";
import { ClipsView } from "@/app/say/[slug]/_components/clips-view";
import { SearchMessage } from "@/app/say/[slug]/_components/search-message";
import { toClipBatch } from "@/app/say/[slug]/_lib/clip-batch";
import { searchMetadata } from "@/app/say/[slug]/_lib/metadata";
import { getSearchPage } from "@/app/say/[slug]/_lib/search.server";
import {
  noClipsTitle,
  TOO_LONG_TITLE,
} from "@/app/say/[slug]/_lib/search-copy";
import { TryLinks } from "@/components/try-links";
import { MAX_QUERY_LENGTH } from "@/lib/query";
import { words } from "@/lib/words";

// ISR (ADR-0011): rendered on the first request for a path, then cached for
// an hour and refreshed in the background. The empty list is what makes
// unlisted paths render on demand rather than dynamically.
export const revalidate = 3600;

export async function generateStaticParams() {
  return [];
}

export async function generateMetadata({
  params,
}: PageProps<"/say/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  return searchMetadata(await getSearchPage(slug));
}

export default async function SearchPage({ params }: PageProps<"/say/[slug]">) {
  const { slug } = await params;
  const page = await getSearchPage(slug);

  switch (page.status) {
    case "too-long":
      return (
        <SearchMessage title={TOO_LONG_TITLE}>
          <p>Searches stop at {MAX_QUERY_LENGTH} characters.</p>
        </SearchMessage>
      );
    case "no-clips":
      return (
        <SearchMessage title={noClipsTitle(page.query)}>
          <TryLinks />
        </SearchMessage>
      );
    case "clips": {
      const queryWords = words(page.query);
      return (
        <ClipsView
          query={page.query}
          queryWords={queryWords}
          firstBatch={toClipBatch(page.firstBatch, queryWords)}
        />
      );
    }
  }
}
