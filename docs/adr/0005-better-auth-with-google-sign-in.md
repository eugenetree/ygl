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
- Email and password sign-in was deliberately left out, because it needs a
  transactional email provider for verification and password reset. better-auth
  can add it to the same user table later without migrating existing users.
