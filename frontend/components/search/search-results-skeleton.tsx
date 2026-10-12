import { PlayerSkeleton } from "@/components/player/player-skeleton";
import { ClipListSkeleton } from "@/components/search/clip-list-skeleton";

/** Placeholders in the shape of SearchResults. */
export function SearchResultsSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <PlayerSkeleton />
      <ClipListSkeleton />
    </div>
  );
}
