// A search page's headings, which its metadata repeats.

export const TOO_LONG_TITLE = "This search is too long";

export function noClipsTitle(query: string): string {
  return `No clips for “${query}”`;
}

export function pronounceHeading(query: string): string {
  return `How to pronounce “${query}”`;
}
