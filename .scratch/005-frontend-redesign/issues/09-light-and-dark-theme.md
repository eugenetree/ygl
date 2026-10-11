# 09 — Light and dark theme

**What to build:** The site follows the listener's system light or dark setting.
A sun/moon button in every header switches theme, and the choice is remembered.
The page never flashes the wrong theme on load.

**Blocked by:** 05 — Desktop, tablet and phone layouts

**Status:** ready-for-agent

- [ ] An inline script in the root layout's head runs before first paint. It reads the stored choice, or falls back to `prefers-color-scheme`, and sets the `dark` class on the html element.
- [ ] The html element suppresses the hydration warning for that class.
- [ ] No "script tag while rendering" warning appears in the dev console.
- [ ] A sun/moon button sits before the sign-in slot:
  - in home's header;
  - in every search page header, icon-sized on tablets and phones.
- [ ] Clicking it stores the choice in localStorage. Until then, the page follows the system, including changes made while it's open.
- [ ] Other open tabs follow a change.
- [ ] The dark palette matches the spec.
  - The primary turns to #fafafa with #18181b on it.
  - The mark keeps #fef08a, with #09090b text on it.
  - The mark line becomes #fafafa.
- [ ] Reloading in dark mode, with the CPU throttled, shows no light frame.
