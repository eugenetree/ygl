"use client";

import { usePlayback } from "@/components/player/playback";
import { formatTotal } from "@/lib/clip-batch";

/** Where the playing clip sits in the search: its number and the total. */
export function useClipPosition(): { number: string; total: string } {
  const {
    state: { currentIndex, total, isTotalExact },
  } = usePlayback();
  return {
    number: (currentIndex + 1).toLocaleString("en-US"),
    total: formatTotal(total, isTotalExact),
  };
}

/** "{n}{separator}{total}". */
export function ClipPosition({
  separator,
  className,
}: {
  separator: string;
  className?: string;
}) {
  const { number, total } = useClipPosition();
  return (
    <span className={className}>
      {number}
      {separator}
      {total}
    </span>
  );
}
