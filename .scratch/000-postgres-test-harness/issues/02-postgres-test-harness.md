# 02 — Postgres test harness, proven by porting the seed fixtures test

**What to build:** A developer can write a test that runs against real Postgres,
with the schema built by replaying the project's actual migrations, and it is
fast enough to run on every red-green cycle. The first such test is the seed
fixtures test, ported off pg-mem — chosen because it has no locking behaviour,
so this ticket proves the harness rather than the concurrency semantics.

Two prefactors come first, both behaviour-preserving. The migration logic
currently lives inside a script that imports the `dbClient` singleton and calls
`process.exit`, so nothing else can reuse it; it becomes a function accepting
any Kysely instance, and the existing migrate and rollback scripts call it.
`DatabaseClient` gains an optional connection-configuration argument defaulting
to today's environment-variable behaviour — the single production seam for all
database tests, and the reason tests get the real class with the real dialect
and plugins instead of a cast lookalike whose configuration can drift.

The harness itself: one container per test run, started in Node's global setup
hook. Test files run in separate parallel processes, so each clones its own
database from a migrated base by template and drops it on teardown; without
this they would truncate each other's fixtures. Within a file, tables are
emptied before each test, with the table list discovered from the database so
that adding a table never silently breaks isolation.

**The base database is named after a hash of the migrations folder contents.**
This is the non-obvious part and it exists to make container reuse safe across
branch switches. Kysely's migrator hard-throws `corrupted migrations: previously
executed migration X is missing` when a branch that added a migration is
switched away from, and a second corruption error when two branches interleave
migration timestamps. Hashing means a branch switch selects a *different* base
database rather than corrupting the existing one, switching back reuses the
earlier one at zero cost, and a migration edited in place is detected — which
simply re-running the migrator would miss. If the hashed base already exists,
migrations are skipped entirely and startup is near-instant.

See `docs/adr/0002-database-tests-run-against-real-postgres.md` for why pg-mem
was abandoned and why the rejected alternatives (schema snapshot, shared dev
database, transaction-rollback isolation) do not work here.

**Blocked by:** 01 — needs Node 24's global-setup hook and the `.db.test.ts`
suffix and script split.

**Status:** ready-for-agent

- [x] Migration logic is callable against any Kysely instance; the existing migrate and rollback scripts behave identically
- [x] `DatabaseClient` accepts optional connection configuration and defaults to current environment-variable behaviour
- [x] Inversify wiring and production runtime behaviour are unchanged
- [x] A database test obtains a real `DatabaseClient` — no `as unknown as` cast, no hand-rebuilt plugin configuration
- [x] The test schema is produced by replaying the project's migrations; no hand-written DDL exists anywhere in test code
- [x] Triggers and `pg_notify` functions defined by migrations are present in the test schema
- [x] One container is started per test run, not per test file
- [x] Migrations are replayed at most once per run
- [x] Each test file operates on its own database; files running in parallel cannot affect each other
- [x] Each test starts from empty tables, with the table list discovered dynamically
- [x] A second run with an unchanged migrations folder reuses the container and skips migrations
- [x] Switching to a branch with an added migration, running tests, switching back, and running again all succeed with no manual cleanup
- [x] Editing an existing migration in place causes a fresh base database rather than a stale schema
- [x] A documented command resets the container and accumulated base databases
- [x] The seed fixtures test passes against real Postgres, asserting idempotency across repeated runs and expected row counts on first run
- [x] Any fixture defect surfaced by real foreign keys, `NOT NULL`s or enum types is fixed in the fixtures, not worked around by relaxing the schema

## Comments

**Implementation notes (2026-09-30)**

- The migrator lives in `src/db/migrator.ts` (`migrateToLatest`, `migrateDown`),
  returning Kysely's result set so the scripts keep their own logging and exit
  codes. Verified against a scratch database: the compiled
  `dist/src/db/scripts/run-migrations.js` (what compose runs) applies all 44,
  `db:migration:rollback` rolls back the last, `db:migration:run` reapplies it.
- `DatabaseClient`'s new parameter is marked `@unmanaged()`. Without it,
  resolution still works today only because a defaulted parameter doesn't count
  toward `Function.length`, which inversify reads. Verified against the `tsc`
  build (tsx emits no decorator metadata, so a tsx probe proves nothing):
  under `autobind: true`, both the container-resolved client and the `dbClient`
  singleton still connect to `DB_HOST`.
- Harness is `src/db/testing/`. `useTestDatabase()` returns a real
  `DatabaseClient` and registers `before`/`beforeEach`/`after` on the enclosing
  suite.
- Node runs `--import` preloads only in the per-file child processes, not in the
  runner process that loads `--test-global-setup` (checked with `NODE_OPTIONS`
  too). So the setup entry is `global-setup.mjs`, which loads the TypeScript via
  `tsx/cjs/api`. `tsImport` doesn't work here: it loads the file as ESM and
  loses the `.js`→`.ts` mapping. The server reaches test files through a
  `TEST_POSTGRES` env var, which the children inherit.
- The base is migrated under a temporary name and renamed when done, so an
  interrupted first run can't leave a half-migrated `base_<hash>` that later
  runs would skip migrating. When two runs build the same base at once, the
  one that loses the rename uses the winner's copy. That shows up as `42P04`,
  or as `23505` on `pg_database` when the renames truly race. Verified with
  three concurrent `npm test` runs on a fresh hash, three times.
- The per-file database is dropped without `WITH (FORCE)`. `pg-pool`'s `end()`
  resolves before its backends exit, and forcing killed them mid-exit, giving an
  uncaught `terminating connection due to administrator command` in about one
  run in eight with 5 parallel files. With a plain drop: 0 failures in 20 runs of
  8 parallel copies of the seed test.
- Verified: cold `npm test` 5.0s, warm 2.2s (126/126). One container per run, no
  Ryuk (reused containers skip it). The base database has the scraper
  status-notify triggers and functions. Adding a table-creating migration built a
  second base, and a probe test confirmed the new table was truncated between
  tests. Removing the migration reused the first base with no error, and
  appending a comment to an existing migration built a third.
  `npm run test:db:reset` removes the container (and with `-v` its volume), and
  is a no-op when there is none.
- The fixtures passed real foreign keys, `NOT NULL`s and enums unchanged, so no
  fixture fixes were needed.
- To run one database test file:
  `node --test --import tsx --test-global-setup=src/db/testing/global-setup.mjs <file>`.
  The error when the setup is missing names the flag.
- Open question for the spec: truncating every table also empties rows the
  migrations seed, the 4 `scraper_config` rows and the `scraping_process` row
  (`id: 1`) that production always has. Nothing touches them yet, but the first
  test that does will start from a state production can't be in. The options are
  to exclude those tables from truncation, or to re-seed them after it. Not
  changed here, because this ticket asks for every test to start from empty
  tables.
