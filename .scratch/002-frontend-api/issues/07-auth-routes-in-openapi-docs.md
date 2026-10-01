# 07 — Auth routes appear in the OpenAPI docs

**What to build:** A developer reading the API's docs page sees the sign-in,
sign-out, callback and account deletion routes alongside search and who-am-I, so
the whole API surface is in one document and one generated client.

better-auth's routes are not Fastify schemas, so they do not appear on their
own. better-auth's OpenAPI plugin produces a document for them, which is merged
into the one the API already serves.

**Blocked by:** 03 — OpenAPI document and docs page for our routes; 05 — Listeners sign in with Google.

**Status:** ready-for-agent

- [x] better-auth's OpenAPI plugin is enabled.
- [x] Its paths and schemas are merged into the single OpenAPI document served under `/api/docs`, without name clashes.
- [x] Only the routes this API actually enables appear; email and password routes do not.
- [x] `/api/me` appears with its signed-in requirement.
- [x] The inject-based docs test also asserts an auth route is listed.

## Comments

- better-auth's generator lists every route it has, whatever the config, and
  refuses the ones left off only at request time. `createAuth` disables every
  route the spec doesn't use, listed by hand: only Google sign-in and its
  callback, `get-session`, `sign-out`, `delete-user` and the OAuth `error`
  page are served. That drops `update-user` (profiles aren't editable),
  `delete-user/callback` (needs email), `link-social`, `unlink-account`, the
  session list and revoke routes, the token routes and `/ok`. Disabled routes
  answer 404 and drop out of the document; the docs test pins the exact set of
  auth paths. better-auth matches `disabledPaths` exactly, so
  `/reset-password/:token` is refused by a `before` hook on its route instead.
  See ADR-0005's addendum.
- better-auth's own docs routes, `/api/auth/reference` (a Scalar page) and
  `/api/auth/open-api/generate-schema`, are disabled too, so `/api/docs` is the
  one place to read the API.
- The merge prefixes better-auth's paths with its base path, renames its
  schemas `AuthUser`, `AuthSession`, `AuthAccount` and `AuthVerification`, and
  rewrites its `$ref`s to match. Our routes declare no shared schemas yet, so
  nothing clashed, but the prefix keeps it that way.
- better-auth writes OpenAPI 3.1 and ours is 3.0.3. The only 3.1 it uses are
  `type: [X, "null"]`, rewritten as `nullable`, and `propertyNames`, dropped
  since it only says keys are strings. The merged document passes
  `swagger-cli validate`, checked once by hand.
- The document declares one security scheme, `session`: the session cookie,
  named as better-auth names it (with the `__Secure-` prefix when the public
  URL is HTTPS). Every route behind `signedIn` is marked as needing it, picked
  up from its pre-handler. better-auth marks all its routes as needing a
  bearer token, which this API does not accept. `/delete-user`, the one
  served route that needs a session, is marked as requiring the cookie; the
  others take it optionally. The generator does not say which need it, so the
  docs plugin names it.
- The docs tests build the server with a real better-auth on a Kysely
  instance whose pool fails to open, so nothing can reach a database, and
  they see what the running API documents.
