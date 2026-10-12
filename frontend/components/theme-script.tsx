"use client";

import { THEME_SCRIPT } from "@/lib/theme";

/**
 * Sets the html element's `dark` class before the first paint.
 *
 * A client component so that, whenever React itself renders it in the
 * browser, it gets a type the browser won't run and React doesn't warn about
 * ("Encountered a script tag while rendering React component").
 */
export function ThemeScript() {
  return (
    <script
      type={typeof window === "undefined" ? "text/javascript" : "text/plain"}
      suppressHydrationWarning
      // biome-ignore lint/security/noDangerouslySetInnerHtml: a constant of ours
      dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }}
    />
  );
}
