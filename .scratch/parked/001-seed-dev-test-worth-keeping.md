# Does src/db/scripts/seed-dev.db.test.ts earn its place in the suite, and in particular does its test "seeds the expected row counts on first run" test anything meaningful?

**Parked:** 2026-09-30 · `main` @ `4aa1366`
**Where:** `src/db/scripts/seed-dev.db.test.ts`, `src/db/scripts/seed-dev.ts`, `src/db/fixtures/*.json`, `.scratch/000-postgres-test-harness/issues/02-postgres-test-harness.md`, `.scratch/000-postgres-test-harness/spec.md`, `docs/adr/0002-database-tests-run-against-real-postgres.md`

## Doubt

"do we really need src/db/scripts/seed-dev.db.test.ts because at least 'seeds the expected row counts on first run' test seems like it doesn't really test something meaningful". The suspicion: that test asserts hard-coded per-table row counts (4 searchChannelQueries, 10 channels, … 40 captions) that just mirror how many entries sit in the JSON files under src/db/fixtures/, so it restates the fixture files rather than checking behaviour, and has to be edited whenever a fixture changes. Whether the file as a whole is needed is also in question.

## Sanity check

**weak**: The premise is true: `src/db/scripts/seed-dev.db.test.ts:87-97` hard-codes eleven per-table counts with no link to the fixtures, and the file's other test (`:73-81`) already exercises `seedDevFixtures` twice, so constraint failures surface there too. But the spec (`.scratch/000-postgres-test-harness/spec.md`, "Modules under test") lists "expected row counts on first run" for `seedDevFixtures` and picked this file as the first real-Postgres test to prove the harness, so deleting it is a spec decision, not just a cleanup.

## Context

- The file tests `seedDevFixtures` in src/db/scripts/seed-dev.ts (inserts src/db/fixtures/*.json in FK order with `ON CONFLICT DO NOTHING`; used by `npm run db:seed:dev` / `make db-fresh` to seed a local dev database).
- It was just ported, assertions unchanged, from a pg-mem version (seed-dev.test.ts, see `git show HEAD:src/db/scripts/seed-dev.test.ts`) to run against real Postgres built from the project's migrations, as part of ticket .scratch/000-postgres-test-harness/issues/02-postgres-test-harness.md (uncommitted work in the tree at park time). That ticket, the parent spec and docs/adr/0002-database-tests-run-against-real-postgres.md chose this test as the first real-Postgres test precisely because it has no locking behaviour, i.e. to prove the harness. So removing or changing it touches a spec decision, and the harness would then be exercised only once ticket 03 ports the other tests.
- Against real Postgres the fixtures passed real foreign keys, NOT NULLs and enum types unchanged; the other test in the file ("running twice produces identical row counts") also runs seedDevFixtures, so any constraint failure would surface there too.
- This question is being parked; the ticket-02 commit is pending and should not be blocked or changed by it.
