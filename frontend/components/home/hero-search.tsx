"use client";

import { SearchIcon } from "lucide-react";
import { AccentPicker } from "@/components/accent-picker";
import { SearchInput } from "@/components/search-input";
import { Button } from "@/components/ui/button";
import { useSearchSubmit } from "@/lib/use-search-submit";

export function HeroSearch() {
  const handleSubmit = useSearchSubmit();

  return (
    <search className="w-full max-w-[620px]">
      <form onSubmit={handleSubmit} className="flex gap-2">
        <div className="flex h-11 min-w-0 flex-1 items-center rounded-lg border bg-surface pr-1 pl-3 shadow-input focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50">
          <SearchInput className="sm:text-[15px]" />
          <AccentPicker look="hero" />
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
