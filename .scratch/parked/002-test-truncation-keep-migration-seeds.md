# Should the per-test truncation in src/db/testing/test-database.ts (`useTestDatabase()`) keep the rows that migrations themselves insert, instead of emptying every table?

**Parked:** 2026-09-30 · `main` @ `b4d43d3`
**Where:** `src/db/testing/test-database.ts`, `src/db/migrations/1774200000000-create-scraper-config.ts`, `src/db/migrations/1774250000000-create-scraping-process.ts`

## Doubt

`useTestDatabase()` runs `TRUNCATE … RESTART IDENTITY CASCADE` before each test over every table in `public` (discovered from `pg_tables`, excluding only Kysely's `kysely_migration` and `kysely_migration_lock`). But some migrations seed rows that production always has: src/db/migrations/1774200000000-create-scraper-config.ts inserts 4 `scraper_config` rows, and src/db/migrations/1774250000000-create-scraping-process.ts inserts the `scraping_process` row with `id: 1`. So every database test starts from a state production can never be in. Nothing touches those tables in tests yet, so it's latent. It will bite the first test that reads scraper config or scraping-process status, and it undercuts the spec's goal "What the tests exercise is what production ships".

## Sanity check

**holds**: the truncation covers all discovered tables (`src/db/testing/test-database.ts:32-45`), and both migrations insert seed rows (`1774200000000-create-scraper-config.ts:13`, `1774250000000-create-scraping-process.ts:20`). The ticket's acceptance criterion ("Each test starts from empty tables", `issues/02-postgres-test-harness.md:54`) and ADR 0002 (`docs/adr/0002-database-tests-run-against-real-postgres.md:42`) favour truncation, but they don't address migration-seeded rows, so the question is open. Ticket 03 (`issues/03-port-remaining-tests-and-retire-pg-mem.md`) covers only the video entries queue and push-channel tests and does not mention these tables. No existing test references `scraper_config` or `scraping_process` either.

## Context

- The harness came from ticket .scratch/000-postgres-test-harness/issues/02-postgres-test-harness.md, committed in b4d43d3. That ticket's acceptance criterion is "Each test starts from empty tables, with the table list discovered dynamically". The parent spec .scratch/000-postgres-test-harness/spec.md (section "Isolation between tests") and docs/adr/0002-database-tests-run-against-real-postgres.md chose truncation over all discovered tables. So changing this is a spec decision, not a bug fix, and it was deliberately left as-is. The ticket's `## Comments` notes record it as an open question.
- Options raised so far, none chosen: (a) exclude the migration-seeded tables from truncation; (b) re-seed those rows after truncating, e.g. by snapshotting their contents from the base database; (c) leave it, and have tests that need those rows insert them. Adding a table-level exclude list would work against "discovered dynamically so new tables need no maintenance".
- The per-file database is cloned from a `base_<hash>` template that already contains the migration-seeded rows. They are only lost at the first `beforeEach` truncation.
- Ticket .scratch/000-postgres-test-harness/issues/03-port-remaining-tests-and-retire-pg-mem.md is next; check whether its tests (video entries queue, push-channel use-case) touch these tables. (Checked at parking time: they do not appear to.)
