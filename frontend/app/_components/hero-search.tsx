"use client";

import { Loader2Icon, SearchIcon } from "lucide-react";
import { HeroAccentPicker } from "@/components/accent-picker";
import { SearchInput } from "@/components/search-input";
import { Button } from "@/components/ui/button";
import { useSearchSubmit } from "@/lib/use-search-submit";
import { cn } from "@/lib/utils";

export function HeroSearch() {
  const { handleSubmit, isPending } = useSearchSubmit();

  return (
    <search className="w-full max-w-[620px]">
      <form onSubmit={handleSubmit} className="flex gap-2">
        <div className="flex h-11 min-w-0 flex-1 items-center rounded-lg border bg-surface pr-1 pl-3 shadow-input focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50">
          <SearchInput className="sm:text-[15px]" />
          <HeroAccentPicker />
        </div>
        {/* The spinner covers the label rather than replacing it, so the
            button keeps its width. */}
        <Button
          type="submit"
          aria-label="Search"
          aria-busy={isPending}
          className="relative h-11 rounded-lg px-[18px] text-sm hover:bg-primary hover:opacity-[.88] max-[399px]:w-11 max-[399px]:px-0"
        >
          <SearchIcon
            aria-hidden
            className={cn("min-[400px]:hidden", isPending && "invisible")}
          />
          <span className={cn("max-[399px]:hidden", isPending && "invisible")}>
            Search
          </span>
          {isPending && (
            <Loader2Icon aria-hidden className="absolute animate-spin" />
          )}
        </Button>
      </form>
    </search>
  );
}
