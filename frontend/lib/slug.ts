import "server-only";

import { words } from "@/lib/words";

// ADR-0012. Slugs are built on the server only, so every path for a search
// names the same canonical slug whatever the browser.
export function slug(query: string): string {
  return words(query).join("-");
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
