import { useSyncExternalStore } from "react";
import { THEME_COLOR_META, THEME_COLORS } from "@/lib/theme-colors";

export type Theme = "light" | "dark";

const STORAGE_KEY = "theme";
const DARK_QUERY = "(prefers-color-scheme: dark)";

/**
 * Runs in the head before the first paint, so a dark page never shows a light
 * frame. Keep it in step with `currentTheme` and `applyTheme`.
 */
export const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem(${JSON.stringify(STORAGE_KEY)});var d=t==="dark"||(t!=="light"&&matchMedia(${JSON.stringify(DARK_QUERY)}).matches);document.documentElement.classList.toggle("dark",d);document.querySelectorAll(${JSON.stringify(THEME_COLOR_META)}).forEach(function(m){m.content=d?${JSON.stringify(THEME_COLORS.dark)}:${JSON.stringify(THEME_COLORS.light)}})}catch(e){}})()`;

function storedTheme(): Theme | null {
  try {
    const theme = localStorage.getItem(STORAGE_KEY);
    return theme === "light" || theme === "dark" ? theme : null;
  } catch {
    return null;
  }
}

function currentTheme(): Theme {
  return storedTheme() ?? (matchMedia(DARK_QUERY).matches ? "dark" : "light");
}

// The theme-color tags name each system theme's color, which a stored choice
// overrides.
function applyTheme() {
  const theme = currentTheme();
  document.documentElement.classList.toggle("dark", theme === "dark");
  for (const meta of document.querySelectorAll<HTMLMetaElement>(
    THEME_COLOR_META,
  )) {
    meta.content = THEME_COLORS[theme];
  }
}

const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  const onChange = () => {
    applyTheme();
    listener();
  };
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY || event.key === null) onChange();
  };
  const media = matchMedia(DARK_QUERY);
  listeners.add(onChange);
  media.addEventListener("change", onChange);
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(onChange);
    media.removeEventListener("change", onChange);
    window.removeEventListener("storage", onStorage);
  };
}

/**
 * The theme on screen: the listener's stored choice, or else the system's.
 * While a component uses it, the html element's `dark` class follows system
 * changes and choices made in other tabs.
 */
export function useTheme(): Theme {
  // The server can't know the theme, so what React renders from this waits
  // for hydration. The class doesn't: the pre-paint script has set it.
  return useSyncExternalStore(subscribe, currentTheme, () => "light");
}

export function setTheme(theme: Theme) {
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {}
  for (const listener of listeners) listener();
}
