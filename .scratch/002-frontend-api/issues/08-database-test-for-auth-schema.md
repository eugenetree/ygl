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

- [x] The test lives in the database suite and runs against a database cloned from the migrated base, per ADR-0002.
- [x] It creates a user and a Google account link through better-auth, then a session, and reads the session back by its token.
- [x] It asserts the rows landed in `users`, `sessions` and `accounts` with UUID ids and snake_case columns.
- [x] It fails if a better-auth column is missing from, or misnamed in, the migration.

## Comments

- The test is `src/modules/auth/auth.db.test.ts`. It builds better-auth with
  `createAuth` on the cloned database, so `auth.ts` needed no seam. The user,
  Google account link and session are made with better-auth's internal
  adapter, as its OAuth callback does. The session is then read back through
  `auth.api.getSession` with a signed session cookie, the same call the
  signed-in guard makes.
- better-auth's runtime schema check, which ticket 05 relies on, does not run
  under tsx. tsx loads `@better-auth/core` twice, so the Kysely adapter
  registers its check in one copy and the auth context looks it up in the
  other. Under plain `node`, as `npm run start:api` runs, the check is there and
  rejects every auth call on a missing column. better-auth's migration diff
  can't stand in either, since it ignores the CamelCasePlugin. So a third test
  selects every column `getAuthTables` declares through our Kysely instance.
- Checked by breaking the migration: misnaming `emailVerified` or `userAgent`
  fails the sign-in tests. Dropping `refreshTokenExpiresAt` or `password`, which
  the test's sign-in never writes, fails only the declared-columns test, with
  Postgres naming the missing snake_case column.
