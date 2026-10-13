import { ClipsLayout } from "@/app/say/[slug]/_components/clips-layout";
import { CaptionCardSkeleton } from "@/app/say/[slug]/_components/player/caption-card";
import { Skeleton } from "@/components/ui/skeleton";

const ROWS = 8;

/** Placeholders in the shape of ClipsView, in every layout. */
export function ClipsSkeleton() {
  return (
    <div aria-busy="true">
      <p className="sr-only" role="status">
        Loading clips…
      </p>
      <ClipsLayout
        title={
          <div className="flex flex-col gap-1.5">
            <Skeleton className="h-6 w-96 max-w-full" />
            <Skeleton className="h-4 w-32" />
          </div>
        }
        video={<Skeleton className="aspect-video rounded-none" />}
        controls={<div className="h-[55px] border-t" />}
        touchControls={<div className="h-15 sm:h-16" />}
        caption={<CaptionCardSkeleton />}
        heading={
          <>
            <Skeleton className="h-5 w-64 max-w-full" />
            <Skeleton className="h-4 w-36" />
          </>
        }
        clips={Array.from({ length: ROWS }, (_, index) => (
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
      />
    </div>
  );
}
