# Users sign in with Google through better-auth

The API authenticates users with better-auth, configured for Google sign-in
only, with sessions stored in Postgres and carried in an httpOnly cookie. We
chose it over hand-rolling because session rotation, CSRF protection and the
OAuth round trip are exactly the parts that are easy to get subtly wrong, and
over a hosted provider (Clerk, Auth0) to keep users in our own database with no
per-user cost.

## Its tables follow our conventions, not its defaults

better-auth's defaults are singular table names (`user`, `session`, `account`,
`verification`; `user` is reserved in Postgres) and short random string ids.
Every other table here is plural, snake_case through Kysely's `CamelCasePlugin`,
and keyed by UUID. Three settings make its tables indistinguishable from ours:

- it is given our existing Kysely instance, so the plugin cases its columns;
- `modelName` maps each model to a plural table name;
- `advanced.database.generateId` is `crypto.randomUUID`.

The schema comes from a normal migration in `src/db/migrations`, generated once
with better-auth's CLI and then owned by us. better-auth never migrates at
runtime, so ADR-0002's rule holds: the tested schema is the shipped schema.

## Consequences

- Cookies require the API to be same-site with the frontend, so it is served
  from a subdomain of the frontend's domain, and CORS names the exact frontend
  origin with credentials instead of `*`.
- better-auth owns the `/api/auth/*` namespace. Replacing it later means
  rewriting sign-in on both server and client and migrating its four tables.
- Since it runs on our Kysely instance, better-auth sets a floor on Kysely's
  version (1.7 needs 0.28 or later), so upgrading either can force the other.
- Email and password sign-in was deliberately left out, because it needs a
  transactional email provider for verification and password reset. better-auth
  can add it to the same user table later without migrating existing users.

## Addendum: only the routes we use are served

better-auth serves every route it has whatever its options, and refuses the
ones its options leave off only when they are called. Its OpenAPI generator
lists them all too. So every route the product doesn't use is listed in
`disabledPaths`, which makes it answer 404 and drops it from the document.
Hiding them from the docs alone would leave them callable, and each is attack
surface we neither test nor want: `update-user` would make profiles editable,
`link-social` would add accounts beside Google.

- **The list is everything but what the spec's flows call:** Google sign-in
  and its callback, `get-session`, `sign-out`, `delete-user`, and the `error`
  page OAuth failures land on. A better-auth upgrade that adds a route shows
  up in the docs test, which pins the exact set of auth paths, so it is
  decided rather than served by default.
- **`disabledPaths` matches the requested path exactly**, so a route with a
  parameter (`/reset-password/:token`) is refused by a `before` hook that
  matches the route instead.
- **better-auth's docs are merged into `/api/docs`**, and its own reference
  page and schema route are disabled, so there is one place to read the API.
- **`freshAge` stays at its default of one day**, so deleting an account
  needs a sign-in within the last day. Google-only users have no password to
  re-enter, so the frontend asks them to sign in again. Loosening it would
  let an old, perhaps stolen, session delete the account.
- **better-auth's runtime schema check does not run under tsx**, which loads
  `@better-auth/core` twice, so the check registers in one copy and is looked
  up in the other. Under plain `node`, as the API runs in production, it
  rejects every auth call on a missing column. Its migration diff ignores the
  CamelCasePlugin, so neither can guard the tests: `auth.db.test.ts` selects
  every column better-auth declares through our Kysely instance instead.
