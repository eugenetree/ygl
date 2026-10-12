"use client";

import { SearchIcon } from "lucide-react";
import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { MAX_QUERY_LENGTH } from "@/lib/query";
import { useSearchSubmit } from "@/lib/use-search-submit";
import { useShortcuts } from "@/lib/use-shortcuts";

export function HeroSearch() {
  const handleSubmit = useSearchSubmit();
  const input = useRef<HTMLInputElement>(null);
  useShortcuts({
    "/": () => {
      input.current?.focus();
      input.current?.select();
    },
  });

  return (
    <search className="w-full max-w-[620px]">
      <form onSubmit={handleSubmit} className="flex gap-2">
        <div className="flex h-11 min-w-0 flex-1 items-center rounded-lg border bg-surface pr-1 pl-3 shadow-input focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50">
          <input
            ref={input}
            type="search"
            name="q"
            aria-label="Word or phrase"
            placeholder="Search a word or phrase…"
            maxLength={MAX_QUERY_LENGTH}
            autoComplete="off"
            spellCheck={false}
            enterKeyHint="search"
            className="min-w-0 flex-1 bg-transparent text-base text-foreground outline-none placeholder:text-muted-foreground sm:text-[15px] [&::-webkit-search-cancel-button]:hidden"
          />
        </div>
        <Button
          type="submit"
          aria-label="Search"
          className="h-11 rounded-lg px-[18px] text-sm hover:bg-primary hover:opacity-[.88] max-[399px]:w-11 max-[399px]:px-0"
        >
          <SearchIcon aria-hidden className="min-[400px]:hidden" />
          <span className="max-[399px]:hidden">Search</span>
        </Button>
      </form>
    </search>
  );
}
