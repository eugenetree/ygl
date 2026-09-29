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

- [ ] The video entries queue test passes against real Postgres with its existing assertions intact — priority ordering, behaviour when priorities are equal, and empty-queue behaviour
- [ ] No test rewrites, normalises or intercepts SQL before execution
- [ ] The push-channel use-case test passes against real Postgres with its existing priority-boosting assertions intact
- [ ] Its dead `SKIP LOCKED` interception is deleted, not ported
- [ ] Fixture defects surfaced by real foreign keys, `NOT NULL`s and enum types are fixed in the fixtures
- [ ] A test holds a row lock on the highest-priority job from a separate connection and asserts `getNextEntry()` returns a different job
- [ ] That test fails when `SKIP LOCKED` is removed from the query, and fails the same way every run
- [ ] That test errors rather than hangs on regression, and the connection pool has room for both the lock-holder and the queue's own connection so it cannot deadlock against itself
- [ ] `pg-mem` is removed from `devDependencies` and appears nowhere in the source tree
- [ ] The pre-commit hook runs the pure and database suites alongside the existing lint and typecheck steps
- [ ] `--no-verify` still bypasses the hook
