# Spec: Database tests run against real Postgres

Status: ready-for-agent

Related: `docs/adr/0002-database-tests-run-against-real-postgres.md`

## Problem Statement

The database-backed tests in this repo do not test the database.

Three test files (`seed-dev.test.ts`, `video-entries.queue.test.ts`,
`push-channel.use-case.test.ts`) run against pg-mem, an in-memory Postgres
emulator. pg-mem cannot execute this project's schema — the migrations contain
`plpgsql` functions, triggers and `pg_notify` calls — so each test hand-writes
its own `CREATE TABLE` DDL. That hand-written schema now duplicates 43
migrations and has already drifted: columns are loose `varchar` where the real
schema uses enums, foreign keys are absent entirely, and the same column is
typed `real` in one file and `double precision` in another.

Worse, two of those tests rewrite the SQL before it executes. They intercept the
outgoing query and delete `FOR UPDATE OF …` and `SKIP LOCKED` because pg-mem
cannot parse them. Those clauses are the entire concurrency guarantee behind
job claiming in the scrapers — the property most worth testing is the one
property these tests structurally cannot catch. A developer reading them
reasonably concludes the queue's concurrency behaviour is covered. It is not.

Separately, and discovered while investigating the above: **the test suite has
never run.** `npm test` invokes `node --test --import tsx "src/**/*.test.ts"` on
Node 18, whose test runner has no glob support (added in Node 21). The command
exits with `Could not find '…/src/**/*.test.ts'`. Combined with no CI and a
husky hook that only runs `lint-staged` and `typecheck`, nothing in this repo
has ever executed a test automatically. Individual files pass when run by hand;
the aggregate has always been a no-op.

## Solution

Database tests run against a real Postgres instance, provisioned by
Testcontainers from the test process, with the schema built by replaying the
project's actual migrations. No hand-written DDL, no rewritten SQL. What the
tests exercise is what production ships.

On top of that, the `SKIP LOCKED` guarantee gets a test that actually holds a
row lock on a separate connection and asserts the queue skips past it — a
deterministic test that fails every time the clause is removed.

The suite is made runnable and enforced: the local Node version is aligned with
the `node:24-alpine` images the project already builds, tests are split by
suffix so a pure-logic pass never needs Docker, and a pre-commit hook runs the
pure and database suites.

## User Stories

1. As a developer, I want database tests to run against real Postgres, so that a
   passing test means the query works in production.
2. As a developer, I want the test schema built from the project's migrations,
   so that it can never drift from what is deployed.
3. As a developer, I want no hand-written `CREATE TABLE` DDL in test files, so
   that adding a column to a migration does not require editing tests.
4. As a developer, I want the migrations themselves exercised on every test run,
   so that a broken migration is caught before deployment rather than at
   container start in production.
5. As a developer, I want `plpgsql` functions, triggers and `pg_notify` present
   in the test schema, so that behaviour depending on them becomes testable at
   all.
6. As a developer, I want the SQL that tests execute to be byte-identical to the
   SQL production executes, so that no test can pass by testing a different
   query.
7. As a developer, I want `FOR UPDATE … SKIP LOCKED` to be exercised rather than
   stripped, so that the job-claiming concurrency guarantee is genuinely
   verified.
8. As a developer, I want a test that holds a row lock on a second connection
   and asserts `getNextEntry()` returns a different job, so that removing
   `SKIP LOCKED` fails the suite deterministically rather than intermittently.
9. As a developer, I want that lock-holding test to time out rather than hang,
   so that a regression produces a red suite instead of a stuck terminal.
10. As a developer, I want real foreign keys and enum types enforced in tests,
    so that fixtures which construct impossible states fail loudly.
11. As a developer, I want `npm test` to actually discover and run test files,
    so that the command means what it says.
12. As a developer, I want my local Node version to match the `node:24-alpine`
    images the project builds, so that what I test is what runs.
13. As a developer, I want the Node version pinned in the repo, so that a fresh
    clone or a new machine does not silently diverge.
14. As a developer, I want a fast test pass that needs no Docker and no network,
    so that pure logic changes have a tight feedback loop.
15. As a developer, I want database tests clearly distinguished from pure tests
    by filename, so that I know what infrastructure a file requires before
    opening it.
16. As a developer, I want the network-dependent test quarantined behind its own
    suffix, so that YouTube being slow or unreachable never fails an unrelated
    change.
17. As a developer, I want the misleading `.test.ts` / `.unit.test.ts` naming
    corrected, so that the plain suffix means "pure and fast" as it does
    everywhere else.
18. As a developer, I want one container started per test run rather than one
    per file, so that startup cost is paid once.
19. As a developer, I want migrations replayed once per run rather than once per
    file, so that the suite stays fast as database tests are added.
20. As a developer, I want each test file to operate on its own database, so
    that files running in parallel cannot destroy each other's fixtures.
21. As a developer, I want per-file databases created by template cloning, so
    that isolation costs milliseconds rather than a full migration replay.
22. As a developer, I want each test to start from empty tables, so that tests
    within a file cannot leak state into one another.
23. As a developer, I want table discovery for truncation to be automatic, so
    that adding a table never silently breaks isolation.
24. As a developer, I want the container reused between runs, so that the
    everyday red-green cycle does not pay container boot.
25. As a developer, I want to switch to a branch with a new migration, run
    tests, switch back, and run tests again — all without manual cleanup, so
    that branch hopping is not a source of confusing failures.
26. As a developer, I want a migration edited in place to be detected, so that
    a reused container never serves a stale schema.
27. As a developer, I want a documented way to reset the test database state, so
    that the escape hatch exists when something does go wrong.
28. As a developer, I want tests to construct the real `DatabaseClient` rather
    than casting a lookalike, so that dialect and plugin configuration cannot
    diverge between test and production.
29. As a developer, I want the production dependency injection wiring unchanged
    by this work, so that the test harness carries no runtime cost.
30. As a developer, I want migration-running logic shared between the scripts
    and the test harness, so that there is one implementation to keep correct.
31. As a developer, I want the pure and database suites to run before each
    commit, so that obvious breakage never lands.
32. As a developer, I want to bypass that hook when I know it is not needed, so
    that work-in-progress commits are not blocked.
33. As a developer, I want pg-mem removed from the project entirely, so that
    nobody reintroduces the pattern by copying an existing test.
34. As a developer, I want the existing assertions preserved through the port,
    so that this migration does not quietly reduce coverage.

## Implementation Decisions

### Provisioning

Testcontainers starts `postgres:18-alpine` — the image the project already uses
in `docker-compose.yml` and already has pulled locally. Rejected: a dedicated
`db-test` service in docker-compose (manual lifecycle, devs must remember to
start it) and a second database inside the existing dev `db` service (requires
the whole dev stack up, and a config slip points `TRUNCATE` at real dev data).

### Schema source

The schema comes from replaying the migrations in `src/db/migrations` via
Kysely's `Migrator`. A checked-in `pg_dump -s` snapshot was rejected: a second
source of truth that drifts the first time someone forgets to regenerate it is
precisely the failure being migrated away from.

`run-migrations.ts` currently imports the `dbClient` singleton and calls
`process.exit`, so it cannot be reused. The migration logic is extracted into a
`migrateToLatest(db)` function accepting any Kysely instance; the existing
script, the rollback script and the test harness all call it.

### Container and database lifecycle

One container per test run, started in Node's `--test-global-setup` hook, which
also ensures the base database exists and is migrated. Test files run in
separate processes and would otherwise truncate a shared database concurrently.

**The base database is named after a hash of the migrations folder contents**
(`base_<hash>`). This is the non-obvious decision and it exists to make
container reuse safe. Kysely's migrator hard-throws
`corrupted migrations: previously executed migration X is missing` when a branch
that added a migration is switched away from, and
`corrupted migrations: expected previously executed migration X to be at index i`
when two branches interleave migration timestamps. Hashing the folder means a
branch switch selects a *different* base database rather than corrupting the
existing one; switching back reuses the earlier one at zero cost. It also
detects migrations edited in place, which re-running the migrator would miss.

If the hashed base database already exists, migrations are skipped entirely.
Stale base databases accumulate over time; a reset command removes them and the
container.

Each test file clones the base with `CREATE DATABASE … TEMPLATE base` and drops
it on teardown.

### Isolation between tests

`TRUNCATE … RESTART IDENTITY CASCADE` before each test, over tables discovered
from `pg_tables` at harness startup, excluding Kysely's own migration
bookkeeping tables. Discovery is dynamic so new tables need no maintenance.

Transaction-rollback isolation was rejected on two independent grounds: the
queues open their own `db.transaction()` and Kysely 0.27 has no savepoint
support, so an outer wrapping transaction cannot nest; and an outer transaction
could not test concurrent claiming regardless, which requires two genuinely
separate connections.

### Test seam

`DatabaseClient` gains an optional constructor parameter for connection
configuration, defaulting to the current environment-variable behaviour. This is
the single production change in `src/`. Because every repository, queue and
use-case already receives `DatabaseClient` through inversify, this one seam
serves all database tests. Inversify's `.toSelf()` binding is unaffected since
the parameter is optional.

This removes the `db as unknown as DatabaseClient` casts and the hand-rebuilt
`CamelCasePlugin` configuration from the test files — tests now get the real
class with the real dialect and plugins, so production configuration changes
cannot silently bypass tests.

### Runtime alignment

Local Node moves to 24 via `.nvmrc` and an `engines` field. Node 24 supplies the
glob support that makes the existing `npm test` script work, plus
`--test-global-setup` and `--test-concurrency`. The Dockerfiles
(`Dockerfile.dev`, `Dockerfile.prod`, `Dockerfile.scraper`) move from
`node:22-alpine` to `node:24-alpine` so local, test and production run one
runtime. The scraper image carries the most native surface and must be rebuilt
and smoke-tested before this is considered done.

### Test taxonomy

Three suffixes, distinguished by required infrastructure:

- `*.test.ts` — pure, no I/O
- `*.db.test.ts` — requires the Postgres container
- `*.net.test.ts` — requires live network

`npm test` runs pure plus database. `npm run test:unit` runs pure only.
`npm run test:net` runs the network suite. The current naming is inverted —
`yt-api-get-video.test.ts` is the integration test while
`yt-api-get-video.unit.test.ts` is the pure one — so the former is renamed to
`.net.test.ts` and the latter's now-redundant `.unit` infix is dropped.

### Enforcement

The husky pre-commit hook gains the pure and database suites alongside the
existing `lint-staged` and `typecheck`. This requires Docker for every commit;
`--no-verify` is the accepted bypass. CI was considered and deliberately
declined for now — the consequence, that `main` is never verified independently
of a developer's machine, is accepted knowingly.

### Removal

`pg-mem` is removed from `devDependencies`, and no test may reintroduce
hand-written schema DDL.

## Testing Decisions

### What makes a good test here

Tests assert externally observable behaviour through the module's public API —
what a caller can see. For the queues that means the job returned by
`getNextEntry()` and the rows a subsequent read observes, not the shape of the
SQL, the transaction boundaries, or which internal method ran. A test that
would break under a legal refactor of the query is testing the wrong thing.

The one deliberate exception is the `SKIP LOCKED` test, which must open its own
connection to hold a lock, because the production API opens and commits its
transaction internally and gives a caller no way to create contention. Even
there the assertion runs through `getNextEntry()`; only the *setup* reaches
past the public surface.

Fixtures are built per test rather than shared, and each test asserts only what
it set up. This survives the move to real foreign keys, where implicit
dependence on other tests' rows would fail.

### Modules under test

- **`VideoEntriesQueue`** — priority ordering, empty-queue behaviour, and the
  new `SKIP LOCKED` contention test. This is the only ported file whose
  exercised path uses row locking.
- **`PushChannelUseCase`** — priority boosting behaviour, unchanged assertions.
  Note that this use-case only calls `enqueue()`, never `getNextEntry()`, so
  the `SKIP LOCKED` interception in its current test was copy-pasted and never
  had any effect; it is simply deleted rather than replaced.
- **`seedDevFixtures`** — idempotency across repeated runs and expected row
  counts on first run. Against the real schema this now also verifies that the
  fixtures satisfy real foreign key ordering.

### Prior art

`channel-priority.calculator.test.ts` and `caption-analysis.service.test.ts` are
the model for pure tests: `node:test` with `describe`/`it`, `node:assert/strict`,
fixtures constructed inline, assertions on returned values only. The database
tests follow the same style — the only difference is where the
`DatabaseClient` comes from.

The existing `beforeEach`-rebuilds-the-world structure in
`video-entries.queue.test.ts` is preserved in shape; only its implementation
changes, from constructing a pg-mem database to cloning a template and
truncating.

## Out of Scope

- **Continuous integration.** Declined for now. Enforcement is the local
  pre-commit hook only.
- **`SKIP LOCKED` coverage for the other three queues.** `channel-entries`,
  `channels` and `search-channel-queries` share the same claim pattern and have
  no tests at all. They are a cheap follow-up once this harness exists, but
  writing them here would turn a migration into a test-writing project.
- **Extracting a shared job-claiming helper** across the four queues. A
  production refactor that should not ride along with a test migration.
- **Upgrading Kysely** to gain savepoint support. Not needed given the chosen
  isolation strategy.
- **Converting the network test** (`yt-api-get-video`) to use recorded fixtures
  or a fake. It is renamed and quarantined, nothing more.
- **Template-database optimisation beyond the base clone** — for example,
  per-test rather than per-file databases. Unwarranted at three files.
- **Testing the `pg_notify` triggers.** They become *present* in the test schema
  as a consequence of running real migrations, but no test is written for them
  here.

## Further Notes

**Expect the port to surface latent fixture bugs, and treat that as the feature
working.** The real schema enforces foreign keys, `NOT NULL` constraints and
genuine enum types (see `1746916250123-processing-status-enum.ts`) that the
hand-written DDL declared as loose `varchar` with no references. Fixtures that
insert a `videoEntries` or `channelEntries` row without its parent `channels`
row, or a status string outside the enum, will now fail. These are real defects
in the fixtures that pg-mem was concealing; they should be fixed in the
fixtures, not worked around by relaxing the schema.

Type mismatches will surface for the same reason — `priority` is declared
`real` in `video-entries.queue.test.ts` and `double precision` in
`seed-dev.test.ts`, and neither is authoritative.

The lock-holding test needs care with connection pool sizing: the pool must have
room for both the lock-holder and the queue's own connection, or the test will
deadlock against itself rather than demonstrating anything. `lock_timeout` on
the test connection turns a genuine regression into a fast failure instead of a
hung suite.

Bumping the Docker images is the highest-risk item and the one least related to
testing. It is included because leaving local on 24 while images stay on 22
reproduces the divergence this work is meant to remove. `Dockerfile.scraper`
carries yt-dlp and the most native surface; a rebuild and smoke test gates it.
