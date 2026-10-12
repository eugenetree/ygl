export type WordSegment = { text: string; isWord: boolean };

// The segmentation of slugs and highlighting (ADR-0012).
const segmenter = new Intl.Segmenter("en", { granularity: "word" });

// UAX #29 keeps letters on either side of one of these in one word (rules
// WB6 and WB7: MidLetter, MidNumLet and '), and Node does. Chrome splits at
// some of them ("a.m", "a:b"), so those words are joined back, and every
// browser reads the same words as the server.
const JOINS_LETTERS = /^[:··՟״‧︓﹕：.‘’․﹒＇．']$/u;
const ENDS_WITH_LETTER = /\p{L}\p{M}*$/u;
const STARTS_WITH_LETTER = /^\p{L}/u;

/** Splits NFC-normalised text into words and the text between them. */
export function segmentWords(text: string): WordSegment[] {
  const segments: WordSegment[] = [];
  for (const { segment, isWordLike } of segmenter.segment(
    text.normalize("NFC"),
  )) {
    const separator = segments.at(-1);
    const word = segments.at(-2);
    if (
      isWordLike &&
      word?.isWord &&
      separator &&
      JOINS_LETTERS.test(separator.text) &&
      ENDS_WITH_LETTER.test(word.text) &&
      STARTS_WITH_LETTER.test(segment)
    ) {
      segments.pop();
      word.text += separator.text + segment;
    } else {
      segments.push({ text: segment, isWord: Boolean(isWordLike) });
    }
  }
  return segments;
}

/** A word or query as it's compared: NFC, lower case, and `’` as `'`. */
export function foldCase(text: string): string {
  return text.normalize("NFC").toLowerCase().replaceAll("’", "'");
}

/** The words of a query, as a slug joins them and highlighting looks for. */
export function words(query: string): string[] {
  return segmentWords(foldCase(query))
    .filter((segment) => segment.isWord)
    .map((segment) => segment.text);
}
