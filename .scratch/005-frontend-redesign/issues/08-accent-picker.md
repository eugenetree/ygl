# 08 — The accent picker

**What to build:** A listener can pick American, British, Australian, Canadian
or Irish English:
- on home;
- in every search page header;
- with keys 1–5.

The choice lives in the URL as `?accent=uk`. Switching restarts at clip 1. No
accent data exists yet, so nothing accent-related reaches the API, and the clips
stay the same.

**Blocked by:** 05 — Desktop, tablet and phone layouts, 07 — Speed and keyboard shortcuts

**Status:** ready-for-agent

- [ ] The accents are American (US), British (UK), Australian (AU), Canadian (CA) and Irish (IE). American is the default.
- [ ] One menu serves every picker: an "Accent" heading, then each accent's name and code, with ✓ by the current one. There are no counts.
- [ ] **Home:** the accent button sits inside the search input, as designed ("American ▾"). Searching carries the accent into the search page's URL.
- [ ] **Search page headers:**
  - an "American ▾" button beside the search form in the side-list header;
  - the accent name inside the search box on tablets;
  - the accent code as a chip inside the search box on phones.
- [ ] Picking an accent replaces the URL's `?accent=`, never adding a history entry. American removes the parameter.
  - An unknown value falls back to American.
  - A new search from the header keeps the accent.
- [ ] Switching accent restarts at clip 1 of the same clips and autoplays it, without refetching.
- [ ] Keys 1–5 pick the accents in menu order, ignored while typing. The shortcuts row gains "1–5 Accent".
- [ ] The accent is read in the browser only. The server render and the API requests are unchanged by it.
