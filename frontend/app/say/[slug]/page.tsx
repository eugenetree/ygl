import { SearchMessage } from "@/components/search/search-message";
import { SearchResults } from "@/components/search/search-results";
import { TryLinks } from "@/components/try-links";
import { toClipBatch } from "@/lib/clip-batch";
import { MAX_QUERY_LENGTH } from "@/lib/query";
import { getSearchPage } from "@/lib/search.server";
import { words } from "@/lib/slug";

// ISR (ADR-0011): rendered on the first request for a path, then cached for
// an hour and refreshed in the background. The empty list is what makes
// unlisted paths render on demand rather than dynamically.
export const revalidate = 3600;

export async function generateStaticParams() {
  return [];
}

export default async function SearchPage({ params }: PageProps<"/say/[slug]">) {
  const { slug } = await params;
  const page = await getSearchPage(slug);

  switch (page.status) {
    case "too-long":
      return (
        <SearchMessage title="This search is too long">
          <p>Searches stop at {MAX_QUERY_LENGTH} characters.</p>
        </SearchMessage>
      );
    case "no-clips":
      return (
        <SearchMessage title={`No clips for “${page.query}”`}>
          <TryLinks />
        </SearchMessage>
      );
    case "clips": {
      const queryWords = words(page.query);
      return (
        <SearchResults
          query={page.query}
          queryWords={queryWords}
          firstBatch={toClipBatch(page.firstBatch, queryWords)}
        />
      );
    }
  }
}
