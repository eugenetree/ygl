# 01 — Replace the old app with the new one and build home

**What to build:** A listener opening saythis.co sees the redesigned home page.
It has the `[saythis]` header, the hero "Hear how it's actually said.", a search
box, "Try" links, "How it works" and the footer. Typing a phrase and pressing
Search goes to its search page at `/say/{slug}`, which ticket 02 builds.

This ticket also lays the foundation every later ticket builds on:
- the new Next.js app in place of the old one;
- the design's tokens;
- the slug rule (ADR-0012);
- the dev setup;
- lint and typecheck in the pre-commit hook;
- a Dockerfile that builds.

The design is the desktop file in this folder's design directory. Its chosen
settings and palettes are listed in the spec.

**Blocked by:** None — can start immediately.

**Status:** resolved

- [ ] The old frontend's files are deleted, and the new app lives in the same folder.
- [ ] The new app runs on the latest stable Next.js with the App Router, React 19, strict TypeScript and standalone output, managed with npm.
- [ ] Tailwind v4 and shadcn/ui are set up.
- [ ] lucide-react, sonner (with its toaster mounted) and the `geist` package are installed.
- [ ] The design's light and dark palettes, radii and shadows are defined as tokens.
  - The light palette is active.
  - The dark values sit under the `dark` class, unused until ticket 09.
- [ ] API types come from the shared contract by a type-only import through a path alias, as the old frontend did.
- [ ] `next dev` runs on port 3000 and rewrites `/api/*` to localhost:3001, in development only.
- [ ] A server-only setting reads `API_URL`, defaulting to `http://localhost:3001` in development.
- [ ] The slug and unslug functions follow the spec's prototype.
  - A one-off script runs them over the prototype's cases: `No worries!`, `9 a.m.`, `the U.S.`, `1,000 dollars`, a decomposed `naïve`, `don’t`, `3.5`, `e.g. this`, `24/7`, `well-known`, `foo_bar`, `a:b`, `l·l`, `rock 'n' roll`, `'cause`, `!!!`, `café`.
  - Every case round-trips and is idempotent. The script isn't committed.
- [ ] Home's header is 56px with a bottom border, padded to the design's 912px content width, and shows the Brackets logo.
  - The theme toggle (ticket 09) and sign-in (ticket 10) come later.
  - The design's Docs and API links are left out.
- [ ] The hero has, as designed:
  - the "English · 5 accents" pill;
  - the H1;
  - the subtitle with the red YouTube logo;
  - a search form at most 620px wide, with a 44px input (placeholder "Search a word or phrase…") and a primary Search button.
- [ ] Submitting the form goes to `/say/{slug}` of the trimmed query.
  - A blank query does nothing.
  - The input stops at 200 characters.
- [ ] The "Try" row links to `/say/schedule`, `/say/water` and `/say/either`.
- [ ] "How it works" shows the three cards, 01–03, with the design's copy.
- [ ] The footer reads "© 2026 saythis.co", with no links.
- [ ] Home works down to 360px wide.
  - The H1 shrinks to about 32px.
  - The Search button may become an icon.
- [ ] Biome's file list includes the frontend, and lint-staged runs it on the frontend's `ts`, `tsx`, `js`, `json` and `css` files.
  - CSS stays out if Biome can't parse Tailwind v4's directives.
- [ ] The pre-commit hook runs the frontend's own typecheck.
- [ ] The frontend's Dockerfile keeps the old shape:
  - built from the repo root;
  - the contract copied in;
  - the standalone server on port 3000.

  `docker build` with that Dockerfile from the repo root succeeds, and the container serves home.
