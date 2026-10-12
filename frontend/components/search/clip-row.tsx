import { HighlightedText } from "@/components/highlighted-text";
import type { HighlightedClip } from "@/lib/clip-batch";
import { formatVideoTime } from "@/lib/time";

export function ClipRow({
  clip,
  number,
  ...props
}: { clip: HighlightedClip; number: number } & Omit<
  React.ComponentProps<"button">,
  "children"
>) {
  return (
    <button
      type="button"
      className="grid w-full grid-cols-[22px_minmax(0,1fr)] items-baseline gap-x-2 gap-y-0.5 rounded-lg p-2.5 text-left transition-colors outline-none hover:bg-tint-subtle focus-visible:ring-3 focus-visible:ring-ring/50"
      {...props}
    >
      <span className="font-mono text-xs text-faint">{number}</span>
      <span className="text-[15px] leading-[1.45] text-sub">
        <HighlightedText
          parts={clip.textParts}
          markClassName="bg-transparent font-semibold text-foreground"
        />
      </span>
      <span className="col-start-2 truncate font-mono text-xs text-faint">
        {clip.video.channel.name} · {formatVideoTime(clip.startTime)}
      </span>
    </button>
  );
}
