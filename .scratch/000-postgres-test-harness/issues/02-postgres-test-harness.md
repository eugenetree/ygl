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

- [ ] Migration logic is callable against any Kysely instance; the existing migrate and rollback scripts behave identically
- [ ] `DatabaseClient` accepts optional connection configuration and defaults to current environment-variable behaviour
- [ ] Inversify wiring and production runtime behaviour are unchanged
- [ ] A database test obtains a real `DatabaseClient` — no `as unknown as` cast, no hand-rebuilt plugin configuration
- [ ] The test schema is produced by replaying the project's migrations; no hand-written DDL exists anywhere in test code
- [ ] Triggers and `pg_notify` functions defined by migrations are present in the test schema
- [ ] One container is started per test run, not per test file
- [ ] Migrations are replayed at most once per run
- [ ] Each test file operates on its own database; files running in parallel cannot affect each other
- [ ] Each test starts from empty tables, with the table list discovered dynamically
- [ ] A second run with an unchanged migrations folder reuses the container and skips migrations
- [ ] Switching to a branch with an added migration, running tests, switching back, and running again all succeed with no manual cleanup
- [ ] Editing an existing migration in place causes a fresh base database rather than a stale schema
- [ ] A documented command resets the container and accumulated base databases
- [ ] The seed fixtures test passes against real Postgres, asserting idempotency across repeated runs and expected row counts on first run
- [ ] Any fixture defect surfaced by real foreign keys, `NOT NULL`s or enum types is fixed in the fixtures, not worked around by relaxing the schema
