import type { TextPart } from "@/app/say/[slug]/_lib/highlight";

export function HighlightedText({
  parts,
  markClassName,
}: {
  parts: readonly TextPart[];
  markClassName?: string;
}) {
  return parts.map((part, index) =>
    part.isMatch ? (
      // biome-ignore lint/suspicious/noArrayIndexKey: parts never reorder
      <mark key={index} className={markClassName}>
        {part.text}
      </mark>
    ) : (
      part.text
    ),
  );
}
