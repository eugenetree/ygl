import Link from "next/link";

const TRY_WORDS = ["schedule", "water", "either"];

export function TryLinks() {
  return (
    <nav
      aria-label="Example searches"
      className="flex w-full max-w-[620px] flex-wrap items-center justify-center gap-2 text-[13px] whitespace-nowrap text-muted-foreground"
    >
      <span>Try</span>
      {TRY_WORDS.map((word) => (
        <Link
          key={word}
          href={`/say/${word}`}
          className="rounded-md border px-2 py-0.5 text-foreground transition-colors hover:bg-tint focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          {word}
        </Link>
      ))}
    </nav>
  );
}
