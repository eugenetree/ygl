import { SearchResultsSkeleton } from "@/components/search/search-results-skeleton";
import { SearchShell } from "@/components/search/search-shell";
import { Skeleton } from "@/components/ui/skeleton";

// Leaving home for a search page that the router knows nothing about yet
// falls back to this boundary, since home has no say layout to wait in. Home
// itself is static and prefetched, so it never shows this.
export default function Loading() {
  return (
    <SearchShell
      search={<Skeleton className="h-9 min-w-0 flex-1 sm:max-w-[520px]" />}
    >
      <SearchResultsSkeleton />
    </SearchShell>
  );
}
