# 08 — Database test for the auth schema

**What to build:** A commit that breaks agreement between better-auth and our
auth migration fails locally before deploy, instead of on the first sign-in in
production.

One database-suite test runs the real migrations and proves better-auth, through
our Kysely instance with the CamelCasePlugin, can create a user and a session and
look the session up again. It follows ADR-0002's conventions and so needs the
Testcontainers harness, which is not built yet.

**Blocked by:** 05 — Listeners sign in with Google; `.scratch/000-postgres-test-harness` ticket 02 — Postgres test harness.

**Status:** ready-for-agent

- [ ] The test lives in the database suite and runs against a database cloned from the migrated base, per ADR-0002.
- [ ] It creates a user and a Google account link through better-auth, then a session, and reads the session back by its token.
- [ ] It asserts the rows landed in `users`, `sessions` and `accounts` with UUID ids and snake_case columns.
- [ ] It fails if a better-auth column is missing from, or misnamed in, the migration.
