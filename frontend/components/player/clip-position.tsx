"use client";

import { usePlayback } from "@/components/player/playback";
import { formatTotal } from "@/lib/clip-batch";

/** "{n}{separator}{total}": where the playing clip sits in the search. */
export function ClipPosition({
  separator,
  className,
}: {
  separator: string;
  className?: string;
}) {
  const {
    state: { currentIndex, total, isTotalExact },
  } = usePlayback();
  return (
    <span className={className}>
      {(currentIndex + 1).toLocaleString("en-US")}
      {separator}
      {formatTotal(total, isTotalExact)}
    </span>
  );
}
