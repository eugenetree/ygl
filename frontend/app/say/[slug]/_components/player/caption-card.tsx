"use client";

import type { VideoCaption } from "@api/contract";
import { memo, useState } from "react";
import { HighlightedText } from "@/app/say/[slug]/_components/highlighted-text";
import {
  usePlayback,
  usePlaybackTime,
} from "@/app/say/[slug]/_components/player/playback";
import { useVideoCaptions } from "@/app/say/[slug]/_components/player/use-video-captions";
import { captionWindow, isInClip } from "@/app/say/[slug]/_lib/caption-window";
import type { HighlightedClip } from "@/app/say/[slug]/_lib/clip-batch";
import { highlight, type TextPart } from "@/app/say/[slug]/_lib/highlight";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * The caption being spoken, between the captions before and after it. Its
 * height doesn't follow the captions, so changing them doesn't move what's
 * below.
 */
export function CaptionCard({
  queryWords,
  className,
}: {
  /** The query's words as the server segments them (see lib/words). */
  queryWords: readonly string[];
  className?: string;
}) {
  const {
    state: { currentClip, isLooping },
  } = usePlayback();
  const timeMs = usePlaybackTime();
  const { data: captions } = useVideoCaptions(currentClip.video.id);

  // Right after a clip becomes current, the time is still the previous
  // clip's until the player gets there.
  const [reachedClipId, setReachedClipId] = useState<string | null>(null);
  const isInCurrentClip = isInClip(currentClip, timeMs, isLooping);
  if (isInCurrentClip && reachedClipId !== currentClip.captionId) {
    setReachedClipId(currentClip.captionId);
  }
  const hasReachedClip =
    isInCurrentClip || reachedClipId === currentClip.captionId;

  const { before, current, after } = captionWindow(
    captions,
    currentClip,
    hasReachedClip ? timeMs : currentClip.playFrom,
    isLooping,
  );

  return (
    <CaptionRows
      className={className}
      before={
        before && (
          <CaptionText
            caption={before}
            clip={currentClip}
            queryWords={queryWords}
          />
        )
      }
      current={
        <CaptionText
          caption={current}
          clip={currentClip}
          queryWords={queryWords}
        />
      }
      after={
        after && (
          <CaptionText
            caption={after}
            clip={currentClip}
            queryWords={queryWords}
          />
        )
      }
    />
  );
}

export function CaptionCardSkeleton() {
  return (
    <CaptionRows
      before={<Skeleton className="h-lh w-2/3" />}
      current={<Skeleton className="h-lh w-full" />}
      after={<Skeleton className="h-lh w-1/2" />}
    />
  );
}

const faintCaption =
  "min-h-lh truncate text-[13px] text-faint sm:text-[14px] side:text-[15px]";

/** The card's frame. The main caption is a band of 3 lines on phones, else 2. */
function CaptionRows({
  before,
  current,
  after,
  className,
}: {
  before: React.ReactNode;
  current: React.ReactNode;
  after: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-1.5 px-4 pb-3 sm:px-0 sm:pt-1 sm:pb-3.5 side:rounded-xl side:border side:px-6 side:py-3.5 side:shadow-card",
        className,
      )}
    >
      <div className={faintCaption}>{before}</div>
      <div className="grid min-h-[3lh] items-center text-[20px] leading-[1.35] font-medium tracking-[-0.01em] sm:min-h-[2lh] sm:text-[24px] side:tracking-[-0.015em]">
        <div>{current}</div>
      </div>
      <div className={faintCaption}>{after}</div>
    </div>
  );
}

function CaptionText({
  caption,
  clip,
  queryWords,
}: {
  caption: Pick<VideoCaption, "captionId" | "text">;
  clip: HighlightedClip;
  queryWords: readonly string[];
}) {
  // The clip's caption is highlighted on the server, where it was rendered
  // first (ADR-0012).
  return caption.captionId === clip.captionId ? (
    <MarkedText parts={clip.textParts} />
  ) : (
    <HighlightedCaption text={caption.text} queryWords={queryWords} />
  );
}

// The card re-renders with every time poll; the captions rarely change.
const HighlightedCaption = memo(function HighlightedCaption({
  text,
  queryWords,
}: {
  text: string;
  queryWords: readonly string[];
}) {
  return <MarkedText parts={highlight(text, queryWords)} />;
});

function MarkedText({ parts }: { parts: readonly TextPart[] }) {
  return (
    <HighlightedText
      parts={parts}
      markClassName="rounded-mark bg-mark box-decoration-clone px-1 side:px-1.5 text-mark-foreground shadow-[inset_0_-2px_0_var(--mark-line)]"
    />
  );
}
