# 05 — Listeners sign in with Google

**What to build:** A listener clicks "Sign in with Google" in the header, comes
back to the page they were on, and sees their name and avatar. Coming back later
keeps them signed in, and they can sign out from the avatar menu. Signing in for
the first time creates the account; there is no separate registration.

Authentication is better-auth, per ADR-0005, with Google as the only method.
Its tables follow our conventions: our Kysely instance, plural table names, and
UUID ids, created by a normal migration. A signed-in guard attaches the user to
the request, and a who-am-I route returns them. Searching stays fully available
when signed out.

**Blocked by:** 02 — The API runs on Fastify with the contract, error shape, and validated config.

**Status:** ready-for-agent

- [x] First step: verify that better-auth's queries pass through Kysely's CamelCasePlugin. If they do not, map its fields to snake_case column names explicitly instead.
- [x] better-auth uses the existing Kysely instance, maps its models to `users`, `sessions`, `accounts` and `verifications`, and generates ids with `crypto.randomUUID`.
- [x] The auth schema is a normal Kysely migration, generated once with better-auth's CLI; better-auth never migrates at runtime.
- [x] better-auth is mounted as a catch-all on `/api/auth/*`, with Google configured and email and password disabled.
- [x] Trusted origins name the exact frontend origin; after sign-in the listener is redirected to a callback URL on the frontend.
- [x] The session cookie is httpOnly and SameSite=Lax, and Secure when the API's public URL is HTTPS.
- [x] A signed-in guard reads the session from the request headers and attaches the user; controllers never call better-auth directly.
- [x] `GET /api/me` returns id, name, email and avatar URL for a signed-in listener, and 401 NOT_SIGNED_IN otherwise. Its schemas live in the contract.
- [x] The config schema gains the better-auth secret, the Google client id and secret, the API's public URL, and the Postgres settings; the example env file and compose block list them.
- [x] The api service receives the Postgres env and waits for the migrate service to complete.
- [x] The frontend uses better-auth's React client pointed at the API URL; the header shows a sign-in button when signed out, and an avatar with a sign-out option when signed in.
- [x] Inject-based tests cover `/api/me` with a stubbed session present and absent.
- [ ] The Google OAuth round trip is checked by hand locally, with a localhost redirect URI registered on the Google client.

## Comments

- better-auth's queries do go through the CamelCasePlugin, so there is no
  `fields` mapping. Checked against real Postgres with a throwaway script: it
  created a user, a Google account link and a session, the rows landed in
  snake_case columns with UUID ids, and the session was found again from a
  signed cookie. Ticket 08 is the committed version of that check.
- better-auth 1.7 needs Kysely 0.28 or later, so Kysely moved from 0.27 to
  0.28. The migrator helpers now take `Kysely<Database>`, since the generic
  signature no longer infers from `DatabaseClient`.
- The migration is what `npx auth generate` prints for an empty database
  through our Kysely instance, written with the schema builder, with `id` and
  `user_id` as `uuid` instead of `text`. Run against an already migrated
  database, the CLI reports every multi-word column as missing, because its
  diff ignores the CamelCasePlugin. better-auth's own runtime schema check
  accounts for it, and stays on.
- The signed-in guard passes on the cookies better-auth sets while looking the
  session up: a refreshed session cookie, or the clearing of an expired one.
  The header reads `/api/me` rather than better-auth's own get-session, so
  without this the browser cookie would lapse after seven days even while the
  session is in use.
- The `/api/auth/*` catch-all gives better-auth the raw request body. It also
  replaces `X-Forwarded-For` with the address Fastify trusts, since
  better-auth's rate limiter keys on that header's first entry. The catch-all
  is hidden from the OpenAPI document until ticket 07.
- Checked by hand against the tsc build, with a placeholder Google client:
  `/api/me` answers 401 signed out; sign-in returns Google's URL with the
  redirect URI on `API_PUBLIC_URL`; a callback URL off the frontend origin is
  refused; email sign-up is disabled; signed in, `/api/me` returns the user
  and a refreshed cookie; sign-out clears the cookies and deletes the session;
  SIGTERM closes the server and the database pool.
- Not yet checked: the Google round trip, and the header on screen. For the
  round trip, register `http://localhost:3001/api/auth/callback/google` on the
  Google client and set `BETTER_AUTH_SECRET`, `GOOGLE_CLIENT_ID` and
  `GOOGLE_CLIENT_SECRET`.
- In production `API_PUBLIC_URL` must be `https://$API_DOMAIN`. Nothing derives
  one from the other, and a mismatch makes Google reject the redirect URI.
- A cancelled or failed sign-in returns the listener to the page with only
  `?error=…` in the URL, and no message.
