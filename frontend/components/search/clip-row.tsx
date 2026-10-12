import { PlayIcon } from "lucide-react";
import { HighlightedText } from "@/components/highlighted-text";
import type { HighlightedClip } from "@/lib/clip-batch";
import { formatVideoTime } from "@/lib/time";

/** A clip in the list. `aria-current` marks the playing one. */
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
      className="group/row grid w-full grid-cols-[22px_minmax(0,1fr)] items-baseline gap-x-2 gap-y-0.5 rounded-lg p-2.5 text-left transition-colors outline-none hover:bg-tint-subtle focus-visible:ring-3 focus-visible:ring-ring/50 aria-[current=true]:bg-soft"
      {...props}
    >
      <span className="font-mono text-xs text-faint">
        <span className="group-aria-[current=true]/row:hidden">{number}</span>
        <PlayIcon
          aria-hidden
          className="hidden size-3 fill-mark-line text-mark-line group-aria-[current=true]/row:inline"
        />
      </span>
      <span className="text-[15px] leading-[1.45] text-sub group-aria-[current=true]/row:text-foreground">
        <HighlightedText
          parts={clip.textParts}
          markClassName="bg-transparent font-semibold text-foreground group-aria-[current=true]/row:rounded-mark group-aria-[current=true]/row:bg-mark group-aria-[current=true]/row:px-[3px] group-aria-[current=true]/row:font-normal group-aria-[current=true]/row:text-mark-foreground group-aria-[current=true]/row:shadow-[inset_0_-2px_0_var(--mark-line)]"
        />
      </span>
      <span className="col-start-2 truncate font-mono text-xs text-faint">
        {clip.video.channel.name} · {formatVideoTime(clip.startTime)}
      </span>
    </button>
  );
}
