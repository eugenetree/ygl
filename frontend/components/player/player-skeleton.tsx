import { Skeleton } from "@/components/ui/skeleton";

/** Placeholders in the shape of the title row and the player card. */
export function PlayerSkeleton() {
  return (
    <div aria-hidden className="flex flex-col gap-4 px-1">
      <div className="flex flex-col gap-1.5">
        <Skeleton className="h-6 w-96 max-w-full" />
        <Skeleton className="h-4 w-32" />
      </div>
      <div className="overflow-hidden rounded-xl border shadow-card">
        <Skeleton className="aspect-video rounded-none" />
        <div className="h-[55px] border-t" />
      </div>
    </div>
  );
}
