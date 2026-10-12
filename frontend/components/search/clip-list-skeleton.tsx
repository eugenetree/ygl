import { Skeleton } from "@/components/ui/skeleton";

const ROWS = 8;

/** Placeholders in the shape of a search's heading and clip list. */
export function ClipListSkeleton() {
  return (
    <div aria-busy="true">
      <p className="sr-only" role="status">
        Loading clips…
      </p>
      <div className="flex flex-col gap-1.5 px-1 pt-1 pb-3">
        <Skeleton className="h-[22px] w-64 max-w-full" />
        <Skeleton className="h-4 w-36" />
      </div>
      <ol className="flex flex-col gap-0.5">
        {Array.from({ length: ROWS }, (_, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: placeholders only
          <li key={index} className="grid grid-cols-[22px_1fr] gap-x-2 p-2.5">
            <Skeleton className="mt-1 h-3 w-3" />
            <div className="flex flex-col gap-1.5">
              <Skeleton className="h-[18px] w-full" />
              <Skeleton className="h-[18px] w-3/4" />
              <Skeleton className="h-3 w-40" />
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
