import { AccountControl } from "@/components/account/account-control";
import { ClipsSkeleton } from "@/components/search/clips-skeleton";
import { SearchShell } from "@/components/search/search-shell";
import { ThemeToggle } from "@/components/theme-toggle";
import { Skeleton } from "@/components/ui/skeleton";

// Leaving home for a search page that the router knows nothing about yet
// falls back to this boundary, since home has no say layout to wait in. Home
// renders per request, so going back to it briefly shows this too.
export default function Loading() {
  return (
    <SearchShell
      search={
        <Skeleton className="h-9 min-w-0 flex-1 rounded-lg sm:h-[38px] sm:max-w-[440px] side:h-9 side:max-w-[520px]" />
      }
      theme={<ThemeToggle />}
      account={<AccountControl />}
    >
      <ClipsSkeleton />
    </SearchShell>
  );
}
