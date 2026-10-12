"use client";

import { SearchIcon } from "lucide-react";
import { useSelectedLayoutSegment } from "next/navigation";
import { MAX_QUERY_LENGTH } from "@/lib/query";
import { useSearchSubmit } from "@/lib/use-search-submit";

/** The search form in the header of `/say/{slug}`, prefilled with its query. */
export function HeaderSearch() {
  const query = queryOf(useSelectedLayoutSegment());
  const handleSubmit = useSearchSubmit();

  return (
    <search className="min-w-0 flex-1 sm:max-w-[520px]">
      {/* Keyed so going back to another search shows its query. */}
      <form key={query} onSubmit={handleSubmit}>
        <div className="flex h-9 items-center gap-2 rounded-md border bg-surface pr-0.5 pl-2.5 shadow-input focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50">
          <SearchIcon aria-hidden className="size-3.5 shrink-0 text-faint" />
          <input
            type="search"
            name="q"
            aria-label="Word or phrase"
            placeholder="Search a word or phrase…"
            defaultValue={query}
            maxLength={MAX_QUERY_LENGTH}
            autoComplete="off"
            spellCheck={false}
            enterKeyHint="search"
            className="min-w-0 flex-1 bg-transparent text-base text-foreground outline-none placeholder:text-muted-foreground sm:text-sm [&::-webkit-search-cancel-button]:hidden"
          />
        </div>
      </form>
    </search>
  );
}

/**
 * The slug read back without segmenting it, which only the server may do
 * (ADR-0012). The app links to canonical slugs, where this is the page's
 * query; a hand-typed path may keep punctuation the page's query drops.
 */
function queryOf(segment: string | null): string {
  if (!segment) return "";
  let decoded = segment;
  try {
    decoded = decodeURIComponent(segment);
  } catch {}
  const query = decoded
    .normalize("NFC")
    .toLowerCase()
    .replaceAll("’", "'")
    .replaceAll("-", " ");
  return query.length > MAX_QUERY_LENGTH ? "" : query;
}
