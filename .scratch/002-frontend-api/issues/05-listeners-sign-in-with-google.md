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

- [ ] First step: verify that better-auth's queries pass through Kysely's CamelCasePlugin. If they do not, map its fields to snake_case column names explicitly instead.
- [ ] better-auth uses the existing Kysely instance, maps its models to `users`, `sessions`, `accounts` and `verifications`, and generates ids with `crypto.randomUUID`.
- [ ] The auth schema is a normal Kysely migration, generated once with better-auth's CLI; better-auth never migrates at runtime.
- [ ] better-auth is mounted as a catch-all on `/api/auth/*`, with Google configured and email and password disabled.
- [ ] Trusted origins name the exact frontend origin; after sign-in the listener is redirected to a callback URL on the frontend.
- [ ] The session cookie is httpOnly and SameSite=Lax, and Secure when the API's public URL is HTTPS.
- [ ] A signed-in guard reads the session from the request headers and attaches the user; controllers never call better-auth directly.
- [ ] `GET /api/me` returns id, name, email and avatar URL for a signed-in listener, and 401 NOT_SIGNED_IN otherwise. Its schemas live in the contract.
- [ ] The config schema gains the better-auth secret, the Google client id and secret, the API's public URL, and the Postgres settings; the example env file and compose block list them.
- [ ] The api service receives the Postgres env and waits for the migrate service to complete.
- [ ] The frontend uses better-auth's React client pointed at the API URL; the header shows a sign-in button when signed out, and an avatar with a sign-out option when signed in.
- [ ] Inject-based tests cover `/api/me` with a stubbed session present and absent.
- [ ] The Google OAuth round trip is checked by hand locally, with a localhost redirect URI registered on the Google client.
