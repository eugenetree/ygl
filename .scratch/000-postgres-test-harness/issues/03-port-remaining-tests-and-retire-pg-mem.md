# 03 — Port the remaining tests, prove SKIP LOCKED, and retire pg-mem

**What to build:** The two remaining pg-mem tests run against real Postgres,
the job-claiming concurrency guarantee gets a test that can actually fail, and
pg-mem leaves the project so nobody reintroduces the pattern by copying an
existing test. The suite runs before every commit.

The video entries queue test is the important one. Its current version
intercepts the outgoing SQL and deletes `FOR UPDATE OF …` and `SKIP LOCKED`
before pg-mem sees them, because pg-mem cannot parse those clauses. That is the
entire concurrency guarantee behind job claiming in the scrapers, so the test
most likely to be trusted is the one that structurally cannot catch a
regression. After the port those clauses execute unmodified.

Then they get asserted. Because `getNextEntry()` opens *and commits* its
transaction internally, a caller has no way to create contention through the
public API — so the test opens a second connection, pins the highest-priority
job with a row lock, and asserts `getNextEntry()` returns the *other* job
rather than blocking on it. Only the setup reaches past the public surface; the
assertion still runs through the real method. This fails every time the clause
is removed, unlike racing N concurrent claims, which passes even when it is
absent because the transactions are too short to collide reliably.

The push-channel use-case test is a straight port. Note that this use-case only
enqueues and never claims, so its `SKIP LOCKED` interception was copy-pasted and
never had any effect — delete it rather than replacing it.

Enforcement is the local pre-commit hook, which will require Docker on every
commit; `--no-verify` is the accepted bypass. CI was considered and deliberately
declined, so `main` is knowingly never verified independently of a developer's
machine.

**Blocked by:** 02 — needs the harness and the established porting pattern.

**Status:** ready-for-agent

- [x] The video entries queue test passes against real Postgres with its existing assertions intact — priority ordering, behaviour when priorities are equal, and empty-queue behaviour
- [x] No test rewrites, normalises or intercepts SQL before execution
- [x] The push-channel use-case test passes against real Postgres with its existing priority-boosting assertions intact
- [x] Its dead `SKIP LOCKED` interception is deleted, not ported
- [x] Fixture defects surfaced by real foreign keys, `NOT NULL`s and enum types are fixed in the fixtures
- [x] A test holds a row lock on the highest-priority job from a separate connection and asserts `getNextEntry()` returns a different job
- [x] That test fails when `SKIP LOCKED` is removed from the query, and fails the same way every run
- [x] That test errors rather than hangs on regression, and the connection pool has room for both the lock-holder and the queue's own connection so it cannot deadlock against itself
- [x] `pg-mem` is removed from `devDependencies` and appears nowhere in the source tree
- [x] The pre-commit hook runs the pure and database suites alongside the existing lint and typecheck steps
- [x] `--no-verify` still bypasses the hook

## Comments

**Implementation notes (2026-10-01)**

- `lock_timeout` is set per test database (`ALTER DATABASE … SET lock_timeout =
  '1s'` in `useTestDatabase()`, before the client's first connection), not on a
  test connection. The session that waits is the one `getNextEntry()` opens
  internally, so a test can't `SET` it. Passing it per connection would mean
  widening `DatabaseConnectionConfig` in `src/db/client.ts`. The consequence is
  that every database test now errors after waiting 1s on a lock, not just the
  contention test.
- Mutation-checked by deleting `.skipLocked()` from `video-entries.queue.ts`.
  The contention test failed 3 of 3 runs with the same assertion, at about
  1.05s (the `lock_timeout`). With the clause restored it passes in about 40ms.
- The lock-holder is a `db.transaction()` on the same pool as the queue. Each
  gets its own connection, and the pool allows 10. `lock_timeout` only covers
  waiting on a lock: with a pool of 1 the queue would hang waiting for a
  connection, and the timeout wouldn't catch it.
- The video queue fixtures passed the real schema unchanged. The push-channel
  fixtures seeded `videoDiscoveryJobs` and `videoJobs` for a channel with no
  `channels` row, and `videoJobs` with no parent `videoEntries` row. Adding the
  `channels` row doesn't change the computed score: a null `subscriberCount`
  falls back to 0, the same as a missing row.
- Both files build the system under test once per `describe` rather than in
  `beforeEach`. The use-case, services and queue hold no state of their own.
- Left as is after review, as judgement calls: the channel-insert fixture is now
  duplicated across the two `.db.test.ts` files, and push-channel's
  `seedVideoJob` also inserts the parent video entry.
- `--no-verify` checked by amending this commit with it: the amend finished in
  0.15s with no lint-staged, typecheck or test output.
