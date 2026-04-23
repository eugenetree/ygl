import type { RefObject } from "react";

export type IconName =
  | "search"
  | "play"
  | "pause"
  | "prev"
  | "next"
  | "sun"
  | "moon"
  | "chevron"
  | "x"
  | "sparkle"
  | "filter";

export function Icon({ name, size = 16 }: { name: IconName; size?: number }) {
  const p = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  if (name === "search")
    return (
      <svg {...p}>
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" />
      </svg>
    );
  if (name === "play")
    return (
      <svg {...p}>
        <path d="M7 5v14l12-7z" fill="currentColor" stroke="none" />
      </svg>
    );
  if (name === "pause")
    return (
      <svg {...p}>
        <rect x="6" y="5" width="4" height="14" fill="currentColor" stroke="none" />
        <rect x="14" y="5" width="4" height="14" fill="currentColor" stroke="none" />
      </svg>
    );
  if (name === "prev")
    return (
      <svg {...p}>
        <path d="M18 6 9 12l9 6V6z" fill="currentColor" stroke="none" />
        <rect x="6" y="6" width="2" height="12" fill="currentColor" stroke="none" />
      </svg>
    );
  if (name === "next")
    return (
      <svg {...p}>
        <path d="m6 6 9 6-9 6V6z" fill="currentColor" stroke="none" />
        <rect x="16" y="6" width="2" height="12" fill="currentColor" stroke="none" />
      </svg>
    );
  if (name === "sun")
    return (
      <svg {...p}>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4" />
      </svg>
    );
  if (name === "moon")
    return (
      <svg {...p}>
        <path d="M20 14.5A8 8 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5z" />
      </svg>
    );
  if (name === "chevron")
    return (
      <svg {...p}>
        <path d="m6 9 6 6 6-6" />
      </svg>
    );
  if (name === "x")
    return (
      <svg {...p}>
        <path d="M6 6l12 12M18 6 6 18" />
      </svg>
    );
  if (name === "sparkle")
    return (
      <svg {...p}>
        <path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8" />
      </svg>
    );
  if (name === "filter")
    return (
      <svg {...p}>
        <path d="M3 6h18M6 12h12M10 18h4" />
      </svg>
    );
  return null;
}

export function SearchBar({
  query,
  setQuery,
  onSubmit,
  big,
  inputRef,
}: {
  query: string;
  setQuery: (v: string) => void;
  onSubmit: (e?: React.FormEvent) => void;
  big?: boolean;
  inputRef?: RefObject<HTMLInputElement | null>;
}) {
  return (
    <form className={"g-search " + (big ? "big" : "")} onSubmit={onSubmit}>
      <span className="g-search-icon">
        <Icon name="search" size={big ? 20 : 16} />
      </span>
      <input
        ref={inputRef}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="a word or a phrase…"
        autoFocus={big}
      />
      <button type="submit" className="g-say">
        say this
      </button>
    </form>
  );
}

export function pushQueryPath(query: string): string {
  return "/" + encodeURIComponent(query.trim());
}

export type AccentFilter = "all" | "us" | "uk" | "au" | "ca";
export type SpeedFilter = "any" | "slow" | "normal" | "fast";
export type EmptyReason = "no-phrase" | "filtered-out" | null;
