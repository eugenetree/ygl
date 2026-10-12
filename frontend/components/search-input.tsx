"use client";

import { useRef } from "react";
import { MAX_QUERY_LENGTH } from "@/lib/query";
import { useShortcuts } from "@/lib/use-shortcuts";
import { cn } from "@/lib/utils";

/** A search form's text field, named "q" for `useSearchSubmit`. `/` focuses it. */
export function SearchInput({
  defaultValue,
  className,
}: {
  defaultValue?: string;
  className?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  useShortcuts({
    "/": () => {
      input.current?.focus();
      input.current?.select();
    },
  });

  return (
    <input
      ref={input}
      type="search"
      name="q"
      aria-label="Word or phrase"
      placeholder="Search a word or phrase…"
      defaultValue={defaultValue}
      maxLength={MAX_QUERY_LENGTH}
      autoComplete="off"
      spellCheck={false}
      enterKeyHint="search"
      className={cn(
        "min-w-0 flex-1 bg-transparent text-base text-foreground outline-none placeholder:text-muted-foreground [&::-webkit-search-cancel-button]:hidden",
        className,
      )}
    />
  );
}
