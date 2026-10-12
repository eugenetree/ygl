import { useSearchParams } from "next/navigation";
import { useEffect, useEffectEvent } from "react";

export type Accent = {
  /** The `?accent=` value, and the code shown in the menu. */
  code: "us" | "uk" | "au" | "ca" | "ie";
  name: string;
};

/** In menu order, which keys 1–5 follow. American, the default, comes first. */
export const ACCENTS: readonly Accent[] = [
  { code: "us", name: "American" },
  { code: "uk", name: "British" },
  { code: "au", name: "Australian" },
  { code: "ca", name: "Canadian" },
  { code: "ie", name: "Irish" },
];

export const DEFAULT_ACCENT = ACCENTS[0];

const PARAM = "accent";

function accentOf(params: Pick<URLSearchParams, "get">): Accent {
  const code = params.get(PARAM);
  return ACCENTS.find((accent) => accent.code === code) ?? DEFAULT_ACCENT;
}

/**
 * The accent in the URL. Search pages are cached by path, so a component
 * using this must sit in a `<Suspense>`, which the server renders as its
 * fallback.
 */
export function useAccent(): Accent {
  return accentOf(useSearchParams());
}

/** A search page's path, keeping the current page's accent. */
export function withCurrentAccent(path: string): string {
  const accent = accentOf(new URLSearchParams(window.location.search));
  return accent === DEFAULT_ACCENT ? path : `${path}?${PARAM}=${accent.code}`;
}

const switchListeners = new Set<() => void>();

/**
 * Puts an accent in the URL in place of the current one, without a history
 * entry or a request. American, the default, leaves no parameter.
 */
export function switchAccent(accent: Accent) {
  const url = new URL(window.location.href);
  const previous = accentOf(url.searchParams);
  if (accent === DEFAULT_ACCENT) url.searchParams.delete(PARAM);
  else url.searchParams.set(PARAM, accent.code);
  if (url.href !== window.location.href) {
    window.history.replaceState(null, "", url);
  }
  if (accent !== previous) {
    for (const listener of switchListeners) listener();
  }
}

/** Runs `onSwitch` whenever the listener picks a different accent. */
export function useAccentSwitch(onSwitch: () => void) {
  const handleSwitch = useEffectEvent(onSwitch);
  useEffect(() => {
    const listener = () => handleSwitch();
    switchListeners.add(listener);
    return () => {
      switchListeners.delete(listener);
    };
  }, []);
}
