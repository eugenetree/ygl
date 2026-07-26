# PRD: Local dev data seeding — minimal fixtures + env-split reference seeder

## Problem Statement

Working locally is painful around database data. Three concrete pains:

1. **Migration divergence across branches.** A local Postgres has migrations 1–3 applied on `main`. A feature branch adds migration 4; a second, unmerged feature branch adds a different migration 5. Switching between branches leaves the local DB carrying migrations that the currently-checked-out branch's folder doesn't contain, so Kysely's `migrateToLatest()` refuses to run ("corrupted migrations" / out-of-order), and `migrateDown()` can't roll back a migration whose `down()` only exists on the other branch.
2. **No minimal local dataset.** The only seeder that exists (`SearchChannelQueriesSeeder`) floods the DB with the entire `words_dictionary.json` (~370k `searchChannelQueries` rows + ~370k `channelDiscoveryJobs`) on first boot of a fresh DB. There is no small, realistic dataset that populates the rest of the pipeline (channels → videos → captions → jobs → priority scores) so the app can be run and exercised by hand locally.
3. **Uncertainty about seeding cadence.** It's unclear whether running the dev server should recreate/reseed the database each time, or whether seeding is an on-demand action.

Underlying all three is a missing shared mental model for what the local database *is* and how much confidence local data can give about production behavior.

## Solution

Adopt an explicit, documented workflow with two complementary code pieces and one governing rule.

**Governing rule (documentation):** the local database is *rebuildable derived state* — a function of `(current branch's migrations) + (seed)`. You never migrate *across* a branch boundary; you *rebuild at* it. Kysely's "corrupted migrations" error is a correct signal that the DB no longer matches the branch — the response is to rebuild, not to hand-patch the migration table. Two data "tracks" serve two different questions: a **minimal seed** answers *"is my logic correct / does the pipeline wire together?"* (the fast inner loop), and an **on-demand production dump** answers *"does it survive prod scale and shape?"* (used deliberately, only for scale-sensitive features).

**Piece 1 — Env-split reference seeder.** Split the search-query word source into `dev.json` (~10 generic words) and `prod.json` (the current dictionary, unchanged). The existing `SearchChannelQueriesSeeder` selects the file by environment, so local boots seed ~10 queries instead of ~370k, while production is unchanged. This continues to run at startup because search queries are genuine reference data.

**Piece 2 — On-demand dev fixtures seeder.** A new, dev-only seeder that populates the rest of the pipeline with a tiny, hardcoded, referentially-consistent dataset — including deliberate edge-case rows — via an explicit command (never wired into app startup, so fake data cannot reach production by construction). Chained into a one-shot `make db-fresh` (drop → migrate → seed) that embodies the "rebuild at the branch boundary" rule.

## User Stories

1. As a developer switching between feature branches, I want a single command that rebuilds my local database to match the current branch's migrations, so that I stop hitting Kysely "corrupted migrations" errors when branches carry different migrations.
2. As a developer, I want to understand that my local database is rebuildable derived state, so that when migrations diverge I confidently rebuild instead of trying to hand-reconcile the `kysely_migration` table.
3. As a developer, I want the "rebuild, don't migrate across branches" rule and the two-track (minimal seed vs prod dump) strategy written down, so that future-me and any collaborator follow it instead of rediscovering it.
4. As a developer running the app locally, I want a small realistic dataset across the whole scraping pipeline (channels, videos, captions, entries, jobs, priority scores), so that I can boot the bot/scraper and walk the flow by hand without scraping real data first.
5. As a developer on a fresh local database, I want boot to seed ~10 search queries instead of ~370k, so that my local environment is fast and manageable and I'm not drowning in discovery jobs I don't need.
6. As an operator of production, I want the reference seeder to keep seeding the full dictionary in prod, so that the env-split change doesn't reduce production's real search-query coverage.
7. As an operator of production, I want the environment selector to default to prod behavior when unset, so that a missing flag can never accidentally seed the tiny dev word list into production.
8. As a developer, I want the dev fixtures seeder to deliberately include edge-case rows (a channel with no videos, a video with null fields, an unscored channel, an orphaned video), so that simply running the app locally exercises the null/empty branches instead of only the happy path.
9. As a developer, I want the dev fixtures to double as living documentation of the states a channel/video/job can be in, so that I can read one file to understand the pipeline's valid states.
10. As a developer, I want the dev fixtures seeder to be idempotent (fixed IDs + `ON CONFLICT DO NOTHING`), so that re-running it is safe and doesn't clobber data I've scraped locally or create duplicates.
11. As a developer, I want the dev fixtures seeder invoked only by an explicit command and never from application startup, so that fake channels and videos physically cannot leak into production.
12. As a developer, I want a `make db-fresh` that drops, migrates, and seeds in one step, so that rebuilding at a branch boundary is a single memorable action.
13. As a developer restarting my dev server repeatedly, I want restarts to preserve my local data (it lives in a Docker volume) and never silently recreate the database, so that I don't lose state I care about mid-investigation.
14. As a developer, I want database recreation to be an explicit act I choose (`make db-fresh` / `db-reset`), never a side effect of running the server, so that data loss is always intentional.
15. As a developer building a scale-sensitive feature (e.g. reprioritizing all channels by analyzing every channel and its videos), I want a documented path to run it against a downloaded production dump, so that I can discover unknown edge cases and validate performance before trusting it.
16. As a developer, I want guidance on which features are scale-sensitive (migrations on large tables, queries that scan/sort/aggregate/join, batch loops over many rows), so that I only spend the effort of a prod-dump dry run where it actually matters.
17. As a developer, I want *known* edge cases encoded as seed rows and hermetic tests, and *unknown* edge cases left to the prod-dump dry run, so that each class of edge case is caught by the right tool.
18. As a developer, I want the existing hermetic pg-mem tests left untouched, so that the new seeder doesn't couple the fast, deterministic test suite to a shared global fixture.
19. As a developer, I want the dev/prod word files co-located with the seeder that reads them, so that the relationship between seeder and its data is obvious.
20. As a developer, I want the large root-level `words_dictionary.json` moved into the seeder's data folder as `prod.json`, so that seed data lives with the code that consumes it rather than loose at the repo root.

## Implementation Decisions

- **Two distinct seeders, wired differently.** The existing `SearchChannelQueriesSeeder` seeds *reference data* (search queries) and continues to run at startup via `seedIfNeeded()` in both environments. The new dev fixtures seeder seeds *fake sample data* and runs **only** via an explicit command — never at startup. This boundary is the primary safety mechanism: fake data cannot reach production because it is not in any production code path.

- **Env-split word source.** The word list is split into two files co-located with the seeder (a new `search-queries/` folder alongside `search-channel-queries.seeder.ts`): `prod.json` (the current `words_dictionary.json` content, moved verbatim) and `dev.json` (~10 generic words). Both keep the existing object-with-word-keys shape so the seeder's `Object.keys(...)` logic is unchanged — the only change to the existing seeder is which file path it reads. The root `words_dictionary.json` is removed once moved.

- **Environment selector.** A new `APP_ENV` variable selects the file: `APP_ENV === "development"` → `dev.json`, otherwise (including unset) → `prod.json`. The codebase currently has no `NODE_ENV` convention (it uses explicit feature flags like `IS_API_ENABLED`), so `APP_ENV` follows that explicit-flag style. The **default is prod** so production is safe when the flag is absent; only a local `.env` opts into `development`. `APP_ENV` is added to `.env.example`.

- **Dev fixtures scope — full pipeline, tiny volume.** The dev fixtures seeder populates the core pipeline end-to-end so every terminal-state table has realistic rows: 1–2 `channels` → their `videos` → `captions` → matching `channelEntries` / `videoEntries` → one row per job table (`channelDiscoveryJobs`, `channelJobs`, `videoDiscoveryJobs`, `videoJobs`) in representative statuses (a mix of `PENDING` and `SUCCEEDED`) → `channelPriorityScores`. It also inserts a small handful of `searchChannelQueries` rows so that startup's `seedIfNeeded()` sees a non-empty table and no-ops even if the reference seeder were reached.

- **Dev fixtures explicitly exclude:** `scraperConfig` (already seeded by its migration `1774200000000-create-scraper-config`, which inserts the four default scraper rows in `up()`), and runtime-managed operational tables (`scrapingProcess`, `elasticCaptionsSync`, `transcriptionJobs`) that the app writes itself during operation.

- **Edge-case rows included by design.** The fixtures deliberately include: a channel with zero videos; a video with null `captionsSimilarityScore` / `duration` / `viewCount`; a channel with no `channelPriorityScores` row; and an orphaned video (a `videoEntries`/`videoJobs` row whose `channelId` has no `channels` row). These make the local app exercise null/empty branches and serve as documentation of valid states.

- **Real-like data source — JSON fixture files sampled from a real local DB.** The fixtures are a small real slice **extracted once from the developer's local Postgres** (rather than invented), stored as one JSON file per table (e.g. `channels.json`, `videos.json`, `captions.json`, plus the job/entry/score/query files). The dev fixtures seeder reads these files and inserts them. Keeping the concrete rows in data files — not inlined into code or this PRD — keeps volatile specifics (IDs, blobs) out of prose and makes the sample easy to regenerate or extend. Sampling is a one-time export (during development the raw export lives in the git-ignored `temp/seed-samples/`; the finalized fixtures are committed alongside the seeder). This is public YouTube data (no PII), so committing the sampled slice is an accepted, conscious choice. Timestamp columns default to `now()` at seed time rather than carrying sampled values. Realistic *distribution* remains the prod-dump track's job, not the seeder's.

- **Full caption-status coverage.** The video fixtures deliberately include one real video for **every combination of `auto_captions_status` × `manual_captions_status` that occurs in real data** (8 combinations, which between them exercise all four `auto` values — `CAPTIONS_ABSENT` / `CAPTIONS_NOT_FETCHED` / `CAPTIONS_TOO_SHORT` / `CAPTIONS_VALID` — and all five `manual` values, additionally including `CAPTIONS_HAS_OVERLAPPING_TIMESTAMPS`). Videos whose status implies captions carry a trimmed set (≤8) of real caption rows; `ABSENT`/`NOT_FETCHED` videos correctly carry none. Each sample video **keeps its real parent channel** (the videos are spread across several real channels), and the fixture therefore includes a `channels` row for **every channel referenced by any mock video** — so the graph is multi-channel and referentially complete rather than collapsed onto one channel.

- **Fixture scope is multi-channel and referentially complete end-to-end.** *Every* channel in the fixture (7 total) carries its full real upstream chain — the `search_channel_query` that discovered it → `channel_discovery_job` → `channel_entry` → `channel_job` → `video_discovery_job` → `channel_priority_score` — not just the primary channel. No row references a missing parent: every video has a `channels` row, every `channel_entry` has its `search_channel_query`, every video has a `video_entries` + `video_jobs` row. The discovery queries legitimately fan out (a single query may have discovered several channels), which is preserved as-is. Concretely the seeded graph is 7 channels, 4 discovery queries (+ their discovery jobs), 7 channel entries/jobs/VDJs/priority scores, 8 videos with 8 entries/jobs, and a trimmed set of caption rows for the captioned videos.

- **Idempotency.** Fixture inserts use fixed IDs and `ON CONFLICT DO NOTHING`, so the command is safe to re-run and additive without clobbering locally-scraped data.

- **Invocation & mechanics.** A new npm script (conceptually `db:seed:dev`) runs the dev fixtures seeder as a standalone script (same style as the existing `src/db/scripts/*` migration scripts). A new `make db-fresh` target chains drop → migrate → dev seed, giving a one-command rebuild at a branch boundary. Existing `db-reset` / `db-migrate` targets are reused as the drop/migrate steps.

- **Local data persistence is unchanged and clarified.** Postgres data lives in a Docker volume; `make up`/restart and `make down` preserve it, only `docker compose down -v` (`rebuild-fresh`) or explicit `db-reset` wipe it. App startup runs migrations + idempotent reference seed and never drops/recreates. No change here — this is documented so the "does running the server recreate the DB?" question has a written answer (no).

- **Two-track data strategy documented.** A short doc records: (a) the "local DB is rebuildable derived state / rebuild-don't-migrate-across-branches" rule; (b) the minimal-seed-vs-prod-dump split and *which* features warrant a prod-dump dry run (migrations on large tables; queries that scan/sort/aggregate/join; batch loops over many rows); (c) the concrete prod-dump path, which already exists via the `Makefile` (`r2-download-latest`, `db-restore`, then `db-migrate` on top — safe because a feature branch's migrations are always a superset of the prod dump's).

- **No ADR.** These are reversible workflow/tooling conventions with no surprising, hard-to-reverse architectural trade-off, so no ADR is written (consistent with how prior small changes in this repo were handled).

## Testing Decisions

- **Good tests here assert observable behavior, not implementation details.** For the dev fixtures, the meaningful properties are referential consistency (no dangling FKs except the *intentional* orphaned fixture) and idempotency (re-running yields the same row counts).

- **Existing hermetic tests stay exactly as they are.** The two DB-touching tests (`push-channel.use-case.test.ts`, `video-entries.queue.test.ts`) build their own pg-mem schema and inline fixtures in `beforeEach`; they must **not** be rerouted through the new seeder. Keeping them hermetic and deterministic is the correct pattern and a decision, not an omission.

- **No test for env-split file selection.** The selection logic is a single ternary inside a private function — trivially correct by inspection. Testing it at the public `seedIfNeeded()` seam would require a complex Kysely mock that couples the test to the fluent-builder API, making it more fragile than the code it guards. The production-safety guarantee (unset `APP_ENV` defaults to prod) is enforced by the default branch of the conditional and is better reviewed as code than verified by a test.

- **Modules to test (light, high-value only):**
  - *Dev fixtures seeder idempotency* — optionally, a pg-mem test that runs the seeder twice and asserts stable row counts and that `ON CONFLICT DO NOTHING` prevents duplicates.
  - The dev fixtures seeder is developer tooling; it does not warrant exhaustive coverage beyond the correctness-relevant (idempotency) property.

- **Prior art:** `push-channel.use-case.test.ts` and `video-entries.queue.test.ts` (both under `src/modules/scraping/`) establish the conventions — plain `node:test` (`describe`/`it`/`beforeEach`) with `node:assert/strict` and pg-mem, no external framework. Any new test follows this style and runs via the existing `npm test` (`node --test --import tsx "src/**/*.test.ts"`). See also `docs/testing-strategy.md` for the broader pg-mem harness direction.

## Out of Scope

- **Automated per-branch database isolation** (e.g. a database-per-branch scheme or a `post-checkout` git hook). A manual `make db-fresh` is the chosen mechanism; an optional warning hook was discussed but deferred.
- **Anonymization of production data.** The prod dump is public YouTube data (captions/metadata), not user PII, so masking tooling is explicitly not adopted; this is a conscious call to revisit only if PII enters the schema.
- **Making the minimal seeder answer scale/shape questions.** That is structurally the prod-dump track's job; the seeder is never grown toward "prod-realistic volume."
- **Rerouting the automated test suite through a shared/global fixture.** Tests remain hermetic.
- **Building the reprioritize-all-channels feature itself.** It's used here only as the motivating example of a scale-sensitive feature; its implementation is separate work.
- **A production-dump download/restore mechanism.** It already exists in the `Makefile`; this PRD only documents when and how to use it.
- **An ADR** for the workflow decisions (explicitly decided against — see Implementation Decisions).

## Further Notes

- This PRD originated from a workflow pain (migration divergence across simultaneous unmerged feature branches) and expanded, through a grilling session, into the broader question of what the local database *is* and how much confidence local data provides. The key reframing: expecting a minimal seeder to give production-scale confidence is a category error — correctness and scale are different questions with different tools.
- The motivating scale-sensitive example is a planned "reprioritize all channels" feature that analyzes every channel and its videos. Its *known* edge cases (channel with no videos, video with null fields, unscored channel) belong in seed rows + hermetic tests; its *unknown* edge cases and performance characteristics belong to a one-off run against a downloaded production dump.
- Existing infrastructure this builds on: the idempotent `seedIfNeeded()` pattern (`start-app.ts`, `main-scraper.ts`), the Kysely migration scripts under `src/db/scripts/`, the scraper-config seeding migration, and the `Makefile` prod-dump targets (`r2-download-latest`, `db-restore`, `db-migrate`).
