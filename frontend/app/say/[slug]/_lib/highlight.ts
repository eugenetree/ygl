import { foldCase, segmentWords } from "@/lib/words";

export type TextPart = { text: string; isMatch: boolean };

/**
 * Splits text into parts, marking every word equal to one of `queryWords`.
 * Matched words separated only by spaces form one part, so a phrase reads as
 * one mark.
 */
export function highlight(
  text: string,
  queryWords: readonly string[],
): TextPart[] {
  const wanted = new Set(queryWords.map(foldCase));
  const parts: TextPart[] = [];
  let gap = "";

  for (const segment of segmentWords(text)) {
    const isMatch = segment.isWord && wanted.has(foldCase(segment.text));
    const last = parts.at(-1);
    if (isMatch && last?.isMatch && /^\s+$/.test(gap)) {
      last.text += gap + segment.text;
      gap = "";
    } else if (isMatch) {
      if (gap) parts.push({ text: gap, isMatch: false });
      parts.push({ text: segment.text, isMatch: true });
      gap = "";
    } else {
      gap += segment.text;
    }
  }
  if (gap) parts.push({ text: gap, isMatch: false });
  return parts;
}
