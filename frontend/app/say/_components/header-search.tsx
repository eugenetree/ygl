"use client";

import { SearchIcon } from "lucide-react";
import { useSelectedLayoutSegment } from "next/navigation";
import { SearchInput } from "@/components/search-input";
import { decodeSegment, MAX_QUERY_LENGTH } from "@/lib/query";
import { useSearchSubmit } from "@/lib/use-search-submit";
import { foldCase } from "@/lib/words";

/**
 * The search form in the header of `/say/{slug}`, prefilled with its query.
 * `accent` sits inside the search box, or beside it in the side-list layout.
 */
export function HeaderSearch({ accent }: { accent: React.ReactNode }) {
  const query = queryOf(useSelectedLayoutSegment());
  const { handleSubmit } = useSearchSubmit();

  return (
    <search className="flex min-w-0 flex-1 sm:max-w-[440px] side:max-w-[520px]">
      {/* Keyed so going back to another search shows its query. */}
      <form
        key={query}
        onSubmit={handleSubmit}
        className="flex h-9 min-w-0 flex-1 items-center rounded-lg border bg-surface pr-1 pl-2.5 has-[input:focus]:border-ring has-[input:focus]:ring-3 has-[input:focus]:ring-ring/50 sm:h-[38px] sm:pl-3 side:h-9 side:gap-1.5 side:border-0 side:bg-transparent side:p-0 side:has-[input:focus]:ring-0"
      >
        <div className="flex h-full min-w-0 flex-1 items-center gap-2 side:rounded-md side:border side:bg-surface side:pr-0.5 side:pl-2.5 side:shadow-input side:has-[input:focus]:border-ring side:has-[input:focus]:ring-3 side:has-[input:focus]:ring-ring/50">
          <SearchIcon aria-hidden className="size-3.5 shrink-0 text-faint" />
          <SearchInput defaultValue={query} className="side:text-sm" />
          <kbd
            aria-hidden
            className="mr-1.5 hidden rounded-sm border bg-kbd px-[5px] font-mono text-[11px] text-muted-foreground side:pointer-fine:inline"
          >
            /
          </kbd>
        </div>
        {accent}
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
  const query = foldCase(decodeSegment(segment)).replaceAll("-", " ");
  return query.length > MAX_QUERY_LENGTH ? "" : query;
}
