# Issue 2 — On-demand dev fixtures seeder, `make db-fresh`, and data-strategy doc

Source PRD: `docs/prd/prd-dev-data-seeder.md`

## What to build

A dev-only, on-demand seeder that gives a fresh local Postgres a small, realistic, referentially-complete slice of the scraping pipeline so the app can be booted and exercised by hand — without scraping real data first and without ever being able to touch production.

The fixture data is a real slice already sampled from a local DB and staged in the git-ignored `temp/seed-samples/` (one JSON file per table). Promote those to a committed fixtures location and add a seeder that loads them and inserts in FK-safe order (channels → search queries → discovery jobs → channel entries → channel jobs → video discovery jobs → priority scores → videos → video entries → video jobs → captions), using fixed IDs + `ON CONFLICT DO NOTHING` so re-running is safe and additive.

The real slice is a 7-channel graph: 4 discovery queries fanning out to 7 channels (each with its full upstream chain), 8 videos covering **every real `auto` × `manual` caption-status combination**, and trimmed caption rows for the captioned videos. On top of the real slice, add a small, clearly-labelled set of **synthetic edge rows** that the real data doesn't contain: a channel with no videos, a channel with no `channelPriorityScores` row, and an orphaned video (an intentional dangling `channelId` — the one deliberate exception to referential completeness).

Expose the seeder via a `db:seed:dev` npm script (standalone script, same style as the existing `src/db/scripts/*` migration scripts) and a `make db-fresh` target that chains drop → migrate → seed as the one-command "rebuild at a branch boundary". The seeder must **never** be invoked from application startup, so fake channels/videos cannot reach production by construction.

Finally, write a short data-strategy doc capturing the governing rules that motivated this work: the local DB is rebuildable derived state (rebuild at a branch boundary rather than migrating across it); the minimal-seed-vs-production-dump split and which features are scale-sensitive enough to warrant a prod-dump dry run (migrations on large tables; queries that scan/sort/aggregate/join; batch loops over many rows); the existing prod-dump path (`r2-download-latest` → `db-restore` → `db-migrate`); and the clarification that restarting the dev server never recreates the DB (data lives in a Docker volume; recreation is always an explicit act).

## Acceptance criteria

- [x] The sampled JSON fixtures are promoted from `temp/seed-samples/` to a committed location read by the seeder.
- [x] `npm run db:seed:dev` on a freshly-migrated DB inserts the full 7-channel graph with no dangling references (except the intentional orphaned-video edge row).
- [x] All 8 real caption-status combinations are present; captioned videos carry their trimmed caption rows, `ABSENT`/`NOT_FETCHED` videos carry none.
- [x] Synthetic edge rows (no-video channel, unscored channel, orphaned video) are present and clearly distinguishable from the real sample.
- [x] Inserts are idempotent: re-running `db:seed:dev` changes no row counts and creates no duplicates.
- [x] The seeder is not referenced by any app startup path (bot/scraper/api); it only runs via the explicit command.
- [x] `make db-fresh` performs drop → migrate → dev seed and leaves a DB matching the current branch's migrations plus the seeded fixtures.
- [x] A test asserts seeder idempotency (e.g. pg-mem, following existing test conventions).
- [x] A data-strategy doc exists covering the rebuildable-DB rule, minimal-seed-vs-prod-dump split + scale-sensitive feature guidance, the prod-dump path, and the "restarts don't recreate the DB" clarification.

## Blocked by

None — can start immediately. Independent of Issue 1 (the fixtures include their own search-query rows and don't depend on the env-split).
