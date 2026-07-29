# Database tests run against real Postgres via Testcontainers

Tests that touch the database run against a real `postgres:18-alpine` container
started by Testcontainers from the test process, with the schema built by
replaying the actual Kysely migrations in `src/db/migrations`. This replaces
pg-mem, which could not run the schema it was meant to emulate.

## Why pg-mem was abandoned

Two structural failures, not ergonomics:

- **The schema was a fiction.** pg-mem cannot execute our `plpgsql` functions,
  triggers or `pg_notify` calls (e.g.
  `1774300000000-scraping-process-actual-status-notify.ts`), so each test
  hand-wrote its own `CREATE TABLE` DDL. Ten tables of it, duplicating 43
  migrations, drifting silently — columns typed as loose `varchar` where the
  real schema has enums, and no foreign keys at all.
- **The tests rewrote the query under test.** Both queue tests monkey-patched
  the outgoing SQL to delete `FOR UPDATE OF …` and `SKIP LOCKED` before pg-mem
  saw it. The job-claiming concurrency guarantee that the scrapers depend on
  (`video-entries.queue.ts`, `channel-entries.queue.ts`, `channels.queue.ts`,
  `search-channel-queries.queue.ts`) was the one thing those tests could never
  have caught.

## Design

- **Schema from migrations, never a snapshot.** `migrateToLatest(db)` is shared
  by the migration scripts and the test harness, so the tested schema is the
  shipped schema by construction. A checked-in `schema.sql` was rejected — a
  second source of truth is exactly the drift we are leaving behind.
- **The base database is named after a hash of the migrations folder**
  (`base_<hash>`). This is the surprising part, and it is deliberate.
  Testcontainers reuse keeps a container warm across runs, but Kysely's migrator
  hard-throws `corrupted migrations: previously executed migration X is missing`
  when a branch that added a migration is switched away from. Hashing the
  folder contents makes branch switching select a *different* base database
  rather than corrupt the existing one, and makes migrations-edited-in-place
  detectable — which re-running the migrator would silently miss.
- **One container per run, one database per test file.** `--test-global-setup`
  starts the container and migrates once; each file then clones the base with
  `CREATE DATABASE … TEMPLATE base` (milliseconds). Without this, `node --test`
  runs files in parallel processes against one database and they `TRUNCATE`
  each other's fixtures.
- **`TRUNCATE … CASCADE` between tests, not transaction rollback.** The queues
  open their own `db.transaction()` and Kysely 0.27 has no savepoint support,
  so an outer wrapping transaction cannot work — and could not test concurrent
  claiming regardless, which needs two genuinely separate connections.
- **`SKIP LOCKED` is asserted by holding a lock on a second connection**:
  `SELECT … FOR UPDATE` pins the highest-priority job, then `getNextEntry()`
  must return the *second* job rather than block. Deterministic, unlike racing
  N concurrent claims, which passes even when the clause is absent. `lock_timeout`
  is set so a regression fails loudly instead of hanging the suite.

## Consequences

- Running DB tests requires Docker. The suite is split by suffix —
  `*.test.ts` (pure), `*.db.test.ts` (Docker), `*.net.test.ts` (live network) —
  so a pure-logic pass stays available without it.
- Stale `base_<hash>` databases accumulate as branches come and go; a reset
  script removes them.
- Fixtures must satisfy real foreign keys, `NOT NULL`s and enum types that the
  hand-written DDL declared away.
