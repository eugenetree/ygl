const OPENING_QUOTES_AND_BRACKETS = /^["“'‘([¿¡]+/;
const CLOSING_QUOTES_AND_BRACKETS = /["”'’)\]]+$/;

/** The number of tokens with a letter or a digit, so `-`, `♪` and `>>` aren't words. */
export function countWords(text: string): number {
  return normalize(text)
    .split(/\s+/)
    .filter((token) => /[\p{L}\p{N}]/u.test(token)).length;
}

/** Whether a caption opens with a capital letter or a digit. */
export function startsSentence(text: string): boolean {
  const opening = normalize(text).replace(OPENING_QUOTES_AND_BRACKETS, "");
  return /^[\p{Lu}\p{Lt}\p{Nd}]/u.test(opening);
}

/**
 * Whether a caption closes with a full stop, question mark or exclamation
 * mark. A trailing ellipsis doesn't count: nearly all of those trail off
 * mid-sentence.
 */
export function endsSentence(text: string): boolean {
  const closing = normalize(text).replace(CLOSING_QUOTES_AND_BRACKETS, "");
  return /[.?!]$/.test(closing) && !/(?:\.\.\.|…)$/.test(closing);
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: "\xA0",
};

function normalize(text: string): string {
  return decodeEntities(text)
    .replace(/<\/?[a-z][^>]*>/gi, "")
    .replace(/[\u{200B}-\u{200D}\u{2060}\u{FEFF}]/gu, "")
    .replace(/[\xA0\r\n]/g, " ")
    .trim()
    .replace(/^(?:-|>>)\s*/, "");
}

function decodeEntities(text: string): string {
  return text.replace(
    /&(?:#(\d+)|#x([\da-f]+)|([a-z]+));/gi,
    (entity, decimal, hex, name) => {
      if (name) return NAMED_ENTITIES[name.toLowerCase()] ?? entity;
      const codePoint = decimal ? Number(decimal) : Number.parseInt(hex, 16);
      return codePoint <= 0x10ffff ? String.fromCodePoint(codePoint) : entity;
    },
  );
}
