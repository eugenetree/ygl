# Should the redesigned frontend use classic Next.js ISR, or Next 16's Cache Components?

**Parked:** 2026-10-13 · `feature/redesign` @ `33dfebf`
**Where:** `.scratch/005-frontend-redesign/spec.md`, `docs/adr/0011-search-pages-render-on-the-server.md`, `frontend/next.config.ts`

Classic ISR means `export const revalidate = 3600` on the `/say/[slug]` page, scaffolded with `create-next-app --no-cache-components`. Cache Components means `'use cache'` plus `cacheLife()`. The design docs are `.scratch/005-frontend-redesign/spec.md` (section "Server rendering and caching (ADR-0011)", lines ~245-263) and `docs/adr/0011-search-pages-render-on-the-server.md`. Two sub-questions:

1. How have open-source Next.js projects that serve ISR pages handled this? Did they migrate to Cache Components or stay on ISR?
2. Would another framework handle this kind of per-path page caching better (TanStack Start/Router, React Router v7, Vue/Nuxt, etc.)? How is it handled elsewhere?

## Doubt

In the user's words: "is this 'cacheComponents' thing kind of propaganded by next.js? is it okay to not use it and still be with next js? won't it be that they simply would barely support current ISR in future and ignore me? ... should I still use next.js in this case?" Facts behind it:

- The Next 15 docs say the route segment options (`revalidate`, `dynamic`, `fetchCache`) are disabled under Cache Components and "will eventually be deprecated in the future".
- The v16 docs list them as removed when `cacheComponents` is enabled.
- In 16.4, `create-next-app --yes` writes `cacheComponents: true` and `partialPrefetching: true` into next.config.

One more suspicion is unverified. Under Cache Components, a render failure (search API down) may stream as a 200 with an error boundary instead of the HTTP 500 the spec requires (user story 81, spec.md:172). If so, that is the only real blocker, because the one-hour cache maps directly onto `cacheLife`.

## Sanity check

**holds**: the premise is true and nothing in the repo settles it. `spec.md:245-263` and `docs/adr/0011-search-pages-render-on-the-server.md:8-9` require a one-hour cache by path, an uncached 500 on failure and a stale page kept on a failed refresh, but name no mechanism. `frontend/next.config.ts` sets neither `cacheComponents` nor `revalidate`, and no source file uses `'use cache'`.

## Context

- **What the spec requires** (spec.md:245-263, ADR-0011):
  - HTML cached by path.
  - Cached for one hour, then stale-while-revalidate.
  - A failure returns an uncached 500.
  - A failed refresh keeps the last good version.
  - Pages render on request, so the Docker build never calls the API.
  - Standalone output, self-hosted on Dokploy behind Traefik.
- **Where caching matters:** only the `/say/[slug]` page. Everything else is client-side (TanStack Query, the YouTube IFrame hook), so a migration would touch only that page.
- **Test suggested so far, not yet done:**
  1. Scaffold with the defaults.
  2. Give the page a page-level `'use cache'` with a one-hour `cacheLife`, and no `<Suspense>` around the clips.
  3. Make the API throw.
  4. From the standalone build, check that the status is 500 and that the stale page is kept on a failed refresh.
- The user had quoted the line "`--no-cache-components` is essential. The 16.4 default is `cacheComponents: true` plus `partialPrefetching: true` written into next.config (see §2 for why we want classic ISR). `--yes` alone turns them on." It is not in any repo file, so its source is unknown.
