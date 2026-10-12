"use client";

import type { VideoCaption } from "@api/contract";
import { memo, useState } from "react";
import { HighlightedText } from "@/components/highlighted-text";
import { usePlayback, usePlaybackTime } from "@/components/player/playback";
import { useVideoCaptions } from "@/components/player/use-video-captions";
import { captionWindow, isInClip } from "@/lib/caption-window";
import type { HighlightedClip } from "@/lib/clip-batch";
import { highlight, type TextPart } from "@/lib/highlight";
import { cn } from "@/lib/utils";

/**
 * The line being spoken, between the lines before and after it. Its height
 * doesn't follow the lines, so changing them doesn't move what's below.
 */
export function CaptionCard({
  queryWords,
  className,
}: {
  /** The query's words as the server segments them (see lib/highlight). */
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
    <div
      className={cn(
        "flex flex-col gap-2 rounded-xl border px-6 py-5 shadow-card",
        className,
      )}
    >
      <p className="min-h-lh truncate text-[15px] text-faint">
        {before && (
          <CaptionText
            line={before}
            clip={currentClip}
            queryWords={queryWords}
          />
        )}
      </p>
      <div className="grid min-h-[3lh] items-center text-[24px] leading-[1.35] font-medium tracking-[-0.015em]">
        <p>
          <CaptionText
            line={current}
            clip={currentClip}
            queryWords={queryWords}
          />
        </p>
      </div>
      <p className="min-h-lh truncate text-[15px] text-faint">
        {after && (
          <CaptionText
            line={after}
            clip={currentClip}
            queryWords={queryWords}
          />
        )}
      </p>
    </div>
  );
}

function CaptionText({
  line,
  clip,
  queryWords,
}: {
  line: Pick<VideoCaption, "captionId" | "text">;
  clip: HighlightedClip;
  queryWords: readonly string[];
}) {
  // The clip's line is highlighted on the server, where it was rendered
  // first (ADR-0012).
  return line.captionId === clip.captionId ? (
    <MarkedText parts={clip.textParts} />
  ) : (
    <HighlightedLine text={line.text} queryWords={queryWords} />
  );
}

// The card re-renders with every time poll; the lines rarely change.
const HighlightedLine = memo(function HighlightedLine({
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
      markClassName="rounded-mark bg-mark box-decoration-clone px-1.5 text-mark-foreground shadow-[inset_0_-2px_0_var(--mark-line)]"
    />
  );
}
