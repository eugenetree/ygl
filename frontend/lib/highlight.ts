export type TextPart = { text: string; isMatch: boolean };

// The same segmentation as the slug (ADR-0012). Browsers split some words the
// server keeps whole, so text highlighted on the server must reach the browser
// as parts rather than be highlighted again there.
const segmenter = new Intl.Segmenter("en", { granularity: "word" });

function wordKey(word: string): string {
  return word.toLowerCase().replaceAll("’", "'");
}

/**
 * Splits text into parts, marking every word equal to one of `queryWords`.
 * Matched words separated only by spaces form one part, so a phrase reads as
 * one mark.
 */
export function highlight(
  text: string,
  queryWords: readonly string[],
): TextPart[] {
  const wanted = new Set(queryWords.map(wordKey));
  const parts: TextPart[] = [];
  let gap = "";

  for (const { segment, isWordLike } of segmenter.segment(
    text.normalize("NFC"),
  )) {
    const isMatch = Boolean(isWordLike) && wanted.has(wordKey(segment));
    const last = parts.at(-1);
    if (isMatch && last?.isMatch && /^\s+$/.test(gap)) {
      last.text += gap + segment;
      gap = "";
    } else if (isMatch) {
      if (gap) parts.push({ text: gap, isMatch: false });
      parts.push({ text: segment, isMatch: true });
      gap = "";
    } else {
      gap += segment;
    }
  }
  if (gap) parts.push({ text: gap, isMatch: false });
  return parts;
}
