import "server-only";

// ADR-0012. Browsers segment differently from the server: Chrome splits
// "a.m" and "a:b", which Node keeps whole. Slugs are computed on the server
// only, so every path for a search names the same canonical slug.
const segmenter = new Intl.Segmenter("en", { granularity: "word" });

export function words(text: string): string[] {
  return [...segmenter.segment(text.normalize("NFC").toLowerCase())]
    .filter((segment) => segment.isWordLike)
    .map((segment) => segment.segment);
}

export function slug(query: string): string {
  return words(query.replaceAll("’", "'")).join("-");
}

export function unslug(slug: string): string {
  return slug.replaceAll("-", " ");
}

/** The search page for what a listener typed, or null when there's nothing to search. */
export function searchPath(input: string): string | null {
  const query = input.trim();
  if (!query) return null;
  // A query with no words, like "!!!", has an empty slug. Its own path still
  // reaches the search page, which shows that nothing matches.
  return `/say/${slug(query) || encodeURIComponent(query)}`;
}
