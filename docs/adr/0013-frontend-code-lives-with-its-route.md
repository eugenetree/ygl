---
status: proposed
---

# Frontend code lives with the route that uses it, for now

Code that only one route uses lives in that route's folder in `frontend/app/`:
its components in `_components/` and everything else in `_lib/`, such as
`app/say/[slug]/_lib/search.server.ts`. Code that more than one route uses lives
in `frontend/components/` or `frontend/lib/`, and moves there as soon as a second
route needs it. Shared code never imports from `app/`. A route may import from
its child route, as `app/say/loading.tsx` does for the search page's skeleton.
The root has no loading screen, so other routes never show a search skeleton.

This is not the final structure. The site has two pages, and nearly all of the
code belongs to one of them, so grouping by route has worked so far. The
question is worth reopening when a third page arrives.

## Considered options

- **Feature folders** (`features/search`, `features/player`, `features/account`),
  as bulletproof-react and Robin Wieruch recommend, with `app/` holding only
  thin route files. Most of the site's features map onto a single page, so this
  would mostly mean a second folder tree mirroring `app/`.
- **Everything in `components/` and `lib/`**, as before. `lib/` had become a mix
  of search-only, player-only and shared code.

## Consequences

- A second page that needs the player, such as saved clips, would move it out
  of `app/say/[slug]/_components/player/`. That is the point to choose between
  `components/player/` and feature folders.
