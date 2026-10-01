# Spec: A structured API for the frontend, with Google sign-in

Status: ready-for-agent

## Problem Statement

The saythis.co frontend talks to a backend API that was built as a single raw
Node HTTP handler with one route. It works for a demo, but it cannot grow into
what the product needs next, and it already has visible bugs.

**Search silently returns at most 10 clips.** No result size is sent to
Elasticsearch, so it applies its default of ten. The results page shows "10
clips" for a phrase said thousands of times, and the Telegram find command's
"showing 10 of N" can never exceed ten either.

**The search result shape is a leak, duplicated per consumer.** The search use
case returns raw Elasticsearch hits. The HTTP handler and the Telegram find
command each cast the stored document by hand and each apply their own
one-second lead-in before playback. A change to the indexed document breaks
both consumers at runtime with no type error, and the two can drift on when a
clip should start playing.

**Nothing describes the contract.** The frontend hand-writes the response type
and guesses the error shape. There is no request validation beyond "q is
present", no documented error codes, and no way for a future consumer to learn
the API short of reading the handler.

**There are no users.** The product roadmap needs people to sign in, starting
with an account and, later, saved favorites. The API has no database access,
no sessions, and CORS set to `*`, which rules out cookies.

**It is not deployable at a public address.** The API is bound to localhost on
the server with nothing terminating TLS in front of it.

## Solution

The API is rebuilt on Fastify with a clear split between transport and domain,
per ADR-0006. The HTTP module owns only server setup, cross-cutting plugins and
thin controllers. Search logic stays in the captions-search module, which now
returns **Clips** (see `CONTEXT.md`) instead of raw Elasticsearch hits, with a
**play-from point** computed once in the core so every consumer starts playback
at the same moment.

Search is paginated with an offset and a limit, and reports how many clips
match in total.

Listeners can sign in with Google, see who they are signed in as, sign out, and
delete their account. Authentication is handled by better-auth, per ADR-0005,
with its tables living in our Postgres under our naming conventions.

Every route declares its request, response and error shapes as zod schemas in
one contract folder. Those schemas drive runtime validation, the frontend's
TypeScript types, and an OpenAPI document with a browsable docs page that any
future consumer can generate a client from.

The frontend and the API share one origin, `https://saythis.co`, per ADR-0008:
Dokploy's Traefik sends `/api/*` to the API and everything else to the frontend,
so the API needs no CORS. Locally, Next's dev server rewrites `/api/*` to the
API, so development is same-origin too.

## User Stories

### Searching

1. As a listener, I want to search for a word or phrase and see every clip where it is said, so that I am not limited to the first ten.
2. As a listener, I want to see how many clips match my search, so that I know how common the phrase is.
3. As a listener, when a phrase matches more than 10,000 clips, I want to see "10,000+" rather than a wrong exact number, so that the count is honest.
4. As a listener, I want more clips to load as I step through them, so that I can keep listening without a "next page" button.
5. As a listener, I want each clip to start playing slightly before the phrase, so that I hear it in context rather than clipped mid-word.
6. As a listener, I want the same clip never to appear twice as I page through results, so that stepping forward always brings something new.
7. As a listener, I want an empty search to be rejected with a clear message, so that I do not see a confusing blank page.
8. As a listener, I want a clear "search is unavailable" state when the search engine is down, so that I know it is not my query's fault.
9. As a listener, I want my search results to be the same whether or not I am signed in, so that signing in is never a requirement to use the product.

### Signing in

10. As a listener, I want to sign in with my Google account, so that I do not have to create and remember another password.
11. As a listener signing in for the first time, I want an account created for me automatically, so that there is no separate registration step.
12. As a signed-in listener, I want the site to show my name and avatar, so that I know I am signed in and as whom.
13. As a signed-in listener, I want to stay signed in when I come back later, so that I do not sign in on every visit.
14. As a signed-in listener, I want to sign out, so that the next person on this device is not using my account.
15. As a signed-in listener, I want to delete my account, so that my personal data is removed when I stop using the product.
16. As a listener who deleted their account, I want signing in with Google again to create a fresh account, so that deletion is not a permanent ban.
17. As a signed-out visitor, I want the site to work fully for searching and listening, so that I can try it before deciding to sign in.
18. As a listener, I want to land back on the page I was on after signing in, so that sign-in does not interrupt what I was listening to.

### Frontend developer

19. As the frontend developer, I want TypeScript types for every request and response imported directly from the backend's contract, so that a renamed field breaks my build instead of my users' page.
20. As the frontend developer, I want every error to have the same shape with a stable code, so that I can handle errors in one place and branch on codes rather than messages.
21. As the frontend developer, I want validation errors to name the offending fields, so that I can show them next to the right input.
22. As the frontend developer, I want a typed client for sign-in, sign-out and account deletion, so that I do not hand-write auth calls.
23. As the frontend developer, I want to read the current user from one endpoint, so that the header can render signed-in or signed-out state on load.

### Future consumers

24. As a developer building another client, I want an OpenAPI document served by the API, so that I can generate a typed client in my own language.
25. As a developer building another client, I want a browsable docs page, so that I can explore routes, parameters and error codes without reading the source.
26. As a developer building another client, I want the auth routes to appear in the same documentation, so that I can see the whole API surface in one place.

### Operator

27. As the operator, I want the API to refuse to start when a required setting is missing, and name it, so that a misconfigured deploy fails at boot rather than on a user's first sign-in.
28. As the operator, I want the frontend and the API served over HTTPS on one origin with automatically managed certificates, so that I do not renew certificates by hand.
29. As the operator, I want one log line per request with method, route, status and duration, so that I can see traffic and failures in the container logs.
30. As the operator, I want unexpected errors logged with their full detail while clients receive only a generic message, so that I can debug without leaking internals.
31. As the operator, I want the API to finish in-flight requests and close its connections when the container stops, so that deploys do not cut requests off mid-response.
32. As the operator, I want the Telegram find command to page through clips the same way the frontend does, so that its counts are correct too.
33. As the operator, I want the auth tables created by the same migrations as everything else, so that the schema has one source of truth.

### Maintainer

34. As the maintainer, I want HTTP controllers kept out of domain modules, so that a future scheduled job or a second transport can reuse use cases without importing Fastify.
35. As the maintainer, I want route behaviour covered by tests that run on every commit, so that contract changes are caught locally, since there is no CI.

## Implementation Decisions

### Layout and framework

- The HTTP module is rebuilt on Fastify. It holds the server factory, a controller interface with a single `register(app)` method mirroring the Telegram controller interface, one controller per endpoint group, and plugins for error handling, request logging and the signed-in guard.
- Feature modules never import Fastify or Telegraf (ADR-0006). The captions-search module gains no HTTP code.
- inversify keeps constructing everything. The API entrypoint builds the container, binds the validated config, and hands the controllers to the server factory.
- The project's own Logger is used for request logging. Fastify's built-in pino logger is disabled so API logs look like the bot's and scraper's.
- The server factory builds the app without listening, so tests can exercise it through Fastify's inject. The entrypoint calls listen and wires SIGTERM and SIGINT to Fastify's close.
- The existing API-enabled flag is kept as it is.

### Search, Clip and the play-from point

- The search use case takes a query, an offset and a limit, and returns a Result holding the clips, the total, and whether the total is exact.
- A Clip carries the caption id, the video id, the caption's own start and end in milliseconds, its text, and the play-from point in milliseconds.
- The play-from point is the caption's start minus one second, never below zero. It is computed once in the core. The frontend and the Telegram find command stop computing their own lead-in.
- The search service validates each stored document against a zod schema when mapping it to a Clip. A document that fails validation is skipped and logged as a warning, so one bad document cannot break a search. Elasticsearch-only fields such as the channel search score never leave the service.
- Elasticsearch is asked for exactly `limit` results from `offset`, sorted by relevance score and then by caption id as a tiebreaker, so pages never overlap.
- The total is tracked up to 10,000. Beyond that, the total is reported as 10,000 and marked as not exact.
- Search failures from Elasticsearch surface as a typed Failure, which the error handler maps to a 503 with the SEARCH_UNAVAILABLE code.
- The Telegram find command is adapted to call the new use case with a limit of ten and to use the total for its "showing 10 of N" header.

### HTTP contract

- `GET /api/search` takes `q` (required, trimmed, 1–200 characters), `offset` (integer, default 0, minimum 0) and `limit` (integer, default 20, 1–50). `offset + limit` may not exceed 10,000, and a request that does is rejected as a validation error.
- The search response body is the clips, the total, and a flag saying whether the total is exact. There is no envelope.
- `GET /api/me` returns the signed-in user's id, name, email and avatar URL, or 401 with NOT_SIGNED_IN.
- Sign-in, sign-out, the OAuth callback and account deletion are better-auth's own routes under `/api/auth/*`, mounted as a catch-all. Account deletion is enabled in its config.
- Every error from our routes has one flat shape: a stable `code`, a human `message`, and, for validation errors only, a list of issues naming each offending field. better-auth's own errors already use a code and a message, so the frontend handles one shape.
- Error codes introduced in this spec:

  | Code | Status | When |
  |---|---|---|
  | VALIDATION_ERROR | 400 | A query or body fails its zod schema |
  | NOT_SIGNED_IN | 401 | A signed-in route is called without a valid session |
  | NOT_FOUND | 404 | No route matches |
  | SEARCH_UNAVAILABLE | 503 | Elasticsearch fails or times out |
  | INTERNAL_ERROR | 500 | Anything unexpected; logged in full, never echoed |

- A single Fastify error handler owns this mapping: zod failures become VALIDATION_ERROR, known Failure types map to their codes, and everything else becomes INTERNAL_ERROR.

### Contract and documentation

- Every route's query, body, response and error schemas live as zod schemas in one contract folder inside the HTTP module.
- Fastify uses them through the zod type provider for validation and response serialization, so the server cannot return a shape the contract does not declare.
- The frontend imports only the inferred types, through a path alias, using type-only imports. No backend code reaches the browser bundle. The frontend gains zod as a dev dependency so the inferred types resolve.
- Fastify's swagger plugin generates an OpenAPI document from the same schemas. better-auth's OpenAPI plugin generates one for the auth routes, and the two are merged into a single document.
- The OpenAPI document and a browsable docs page are served under `/api/docs` in every environment. No generated file is committed.

### Users and authentication (ADR-0005)

- better-auth is configured with Google as the only sign-in method. Email and password is not enabled.
- It is given the existing Kysely instance so Kysely's CamelCasePlugin applies to its columns. `modelName` maps its four models to the plural tables `users`, `sessions`, `accounts` and `verifications`. `generateId` is `crypto.randomUUID`.
- The first task is to verify that better-auth's queries go through the CamelCasePlugin. If they do not, fall back to its per-field `fields` mapping to snake_case column names.
- The auth schema is added as a normal Kysely migration, generated once with better-auth's CLI and then owned by the repo. better-auth never migrates at runtime.
- Sessions are database-backed and carried in an httpOnly, SameSite=Lax cookie, Secure whenever the public origin is HTTPS.
- A signed-in guard, implemented as a Fastify pre-handler, asks better-auth for the session from the request headers and attaches the user to the request. Controllers read the user from the request and never call better-auth directly.
- The API has no CORS: no browser calls it cross-origin (ADR-0008). better-auth trusts only its own origin, which is also the frontend's.
- After sign-in, better-auth redirects to a callback URL on the frontend, which is on that same origin.
- The API container gains Postgres access and waits for the migrate service to complete.

### Configuration

- One zod schema describes the API's settings. It is parsed once at startup and bound in the container. A missing or malformed value stops the process with the variable's name.
- Settings: port, the public origin (`PUBLIC_ORIGIN`, the one origin browsers reach the site and the API on), the better-auth secret, the Google client id and secret, the Elasticsearch node, and the Postgres settings.
- The Elasticsearch node no longer silently falls back to a default when read through this config.
- Only the API entrypoint uses the validated config. The bot, scraper and sync entrypoints are unchanged.
- The new variables are added to the example env file and the api service's compose block.

### Deployment

- Dokploy's Traefik, which already holds 80 and 443 on the server, terminates TLS for `saythis.co` and routes by path (ADR-0007, ADR-0008): `/api` is a Dokploy domain on the compose app's api service, port 3001, with the prefix kept; `/` is a Dokploy domain on the frontend. Compose has no proxy of its own.
- The frontend is a separate Dokploy Application, not a compose service, so deploying one doesn't restart the other. It is built from `frontend/Dockerfile` with the repo root as build context, so the contract import resolves.
- `www.saythis.co` redirects permanently to `saythis.co`.
- Fastify trusts exactly one proxy hop, so it sees the client's real address and scheme.
- The api service keeps its localhost port binding for local development without a proxy.
- Locally, the API runs on localhost:3001 and `next dev` on localhost:3000 rewrites `/api/*` to it, in development only. The browser only ever talks to localhost:3000.

### Frontend

- The frontend's API client uses the contract types, sends credentials with every request, and calls the API by relative `/api/...` paths, so it needs no API URL setting.
- The results page requests the next page as the listener reaches the last loaded clip, shows the total with a "+" when it is not exact, and starts playback at the play-from point.
- The header gains a "Sign in with Google" button when signed out, and the user's avatar with a menu offering sign-out and account deletion when signed in. Account deletion asks for confirmation.
- The frontend uses better-auth's React client on its own origin.

## Testing Decisions

A good test here drives the system through the same door a real caller uses and asserts on what that caller sees: status codes, response bodies, error codes. It must not assert on which internal method was called or in what order. A test that would still pass after a correct refactor of the internals, and fail after a behaviour change, is the goal.

### Seams

1. **The HTTP app, through Fastify's inject.** The main seam. The server factory is built with a test container in which use cases are replaced with stubs. Tests cover validation (missing `q`, `limit` over 50, `offset + limit` over 10,000), the error shape and codes for each failure type, the search response shape, the signed-in guard on `/api/me` with and without a session, and that the OpenAPI document is served and lists the search route. These run in the pure suite, with no Docker and no network.
2. **Clip mapping, as pure unit tests.** Fixture Elasticsearch documents go in, Clips come out. Covers the play-from point including the clamp at zero, skipping documents that fail validation, the exact and not-exact total, and that Elasticsearch-only fields are dropped.
3. **The auth schema, through the database suite.** One test runs the migrations and proves better-auth can create a user, create a session, and look it up again through our Kysely instance. This test depends on the Testcontainers harness from ADR-0002, which is not built yet (`.scratch/000-postgres-test-harness`). Until it lands, this test is written but its ticket is blocked.

### Not covered automatically

- Whether Elasticsearch ranks and paginates correctly against a real index. A real-Elasticsearch suite can be added later as an opt-in suite like the live-network one.
- The Google OAuth round trip. It is checked by hand after the first deploy.

### Prior art

- `node:test` with `node:assert/strict` throughout, run by the `test` script over `src/**/*.test.ts`.
- `push-channel.use-case.test.ts` and `process-scraper-failure.use-case.test.ts` show use cases built directly with stubbed collaborators.
- `caption-analysis.service.test.ts` shows pure service tests over fixtures.
- ADR-0002 defines the database-suite conventions the auth test will follow once the harness exists.

## Out of Scope

- **Favorites.** Deferred. The Phrase term is not added to the glossary until a feature needs it.
- **A server-side phrase list.** Random phrases and the phrase of the day stay hardcoded in the frontend. The frontend may pick the phrase of the day by date.
- **Email and password sign-in**, email verification, password reset, and any transactional email provider.
- **Editable profiles.** The Google name and avatar are used as they are.
- **Health checks**, liveness or readiness.
- **Rate limiting** on our routes. better-auth's built-in limiter on its own routes stays at its defaults.
- **Moving the Telegram controllers** or restructuring the Telegram module beyond adapting the find command to Clips.
- **Validated config for the bot, scraper and sync entrypoints.**
- **The Elasticsearch index mapping.** It declares snake_case fields while the sync writes camelCase documents, so the declared mapping is not in effect. Worth fixing separately, but it does not change the API contract.
- **A real-Elasticsearch test suite.**

## Further Notes

- The frontend UI changes (sign-in button, avatar menu, account deletion confirmation, infinite paging) were not designed in detail during the grilling session. The spec states the minimum needed to exercise the API. Visual design is the frontend developer's call.
- If the frontend is built with only the frontend folder as the build context, the type-only import from the backend contract will not resolve. Its Dokploy Application uses the repo root as context for that reason.
- A Google OAuth client must be created in Google Cloud Console, with `$PUBLIC_ORIGIN/api/auth/callback/google` as an authorised redirect URI for every environment (`https://saythis.co/...` and `http://localhost:3000/...`), before sign-in works there.
- ADR-0005 and ADR-0006 record the auth and layout decisions, ADR-0007 and ADR-0008 the routing. `CONTEXT.md` defines Caption, Search, Clip and Play-from point.
