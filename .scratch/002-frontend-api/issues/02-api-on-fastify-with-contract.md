# 02 — The API runs on Fastify with the contract, error shape, and validated config

**What to build:** The frontend developer gets TypeScript types for search
imported straight from the backend, one predictable error shape with stable
codes, and a listener can keep stepping through clips as more load behind them.
The operator gets an API that refuses to start with a missing setting, logs one
line per request, and shuts down cleanly.

The raw Node handler is replaced by a Fastify app, laid out per ADR-0006: the
HTTP module holds the server factory, a controller interface with a single
`register(app)` method mirroring the Telegram one, a search controller, and
plugins for CORS, errors and request logging. The captions-search module gains
no HTTP code. See the spec's "HTTP contract", "Contract and documentation" and
"Configuration" sections for the exact rules.

**Blocked by:** 01 — Search returns paginated Clips with a play-from point.

**Status:** ready-for-agent

- [x] The server factory builds the Fastify app without listening; the entrypoint listens and wires SIGTERM and SIGINT to Fastify's close.
- [x] Fastify's built-in logger is off; the project's Logger writes one line per request with method, route, status and duration.
- [x] The search route's query, response and error schemas are zod schemas in one contract folder, used through the zod type provider for validation and serialization.
- [x] `q` is required, trimmed, 1–200 characters; `offset` defaults to 0; `limit` defaults to 20 and is capped at 50; `offset + limit` above 10,000 is rejected.
- [x] Every error from our routes has a `code` and a `message`, plus an issues list for VALIDATION_ERROR only.
- [x] One error handler maps zod failures to VALIDATION_ERROR (400), unknown routes to NOT_FOUND (404), search Failures to SEARCH_UNAVAILABLE (503), and anything else to INTERNAL_ERROR (500), logging the last in full and never echoing its detail.
- [x] One zod config schema is parsed at startup and bound in the container; a missing or malformed value stops the process naming the variable. Scope is the API entrypoint only.
- [x] CORS names the exact frontend origin from config, with credentials allowed; the wildcard is gone.
- [x] New variables are in the example env file and the api service's compose block.
- [x] The existing API-enabled flag still gates startup as before.
- [x] The frontend imports the search types from the contract with type-only imports through a path alias, and gains zod as a dev dependency.
- [x] The frontend sends credentials with requests, loads the next page when the listener reaches the last loaded clip, and shows the total with a "+" when it is not exact.
- [x] Inject-based tests with stubbed use cases cover each validation rule, each error code and its shape, the search response shape, and CORS headers for the allowed and a disallowed origin. They run in the pure suite.

## Comments

- `fastify-type-provider-zod` is on 4.x: 5.x and later need zod 4, and the repo
  is on zod 3. Moving to zod 4 would let it upgrade.
- The inject tests build `SearchController` directly rather than through a
  test container. Tests run under tsx, which emits no decorator metadata, so
  inversify cannot resolve constructor arguments there. The container wiring in
  `main-api.ts` and `parseApiConfig` were checked by hand against the tsc
  build: the API-enabled gate, missing and malformed settings, a live 503/400/404,
  CORS headers, and SIGTERM closing cleanly.
- The `offset + limit` issue names both `offset` and `limit`.
- Known gaps, left for later:
  - A URL Fastify cannot parse (e.g. `/api/%E0%A4%A`) gets Fastify's own error
    body and no log line; routing it through `frameworkErrors` would fix both.
  - `z.coerce.number()` accepts `limit=1e1` or `offset=0x10` as integers.
  - One failed next-page load stops paging for that search, with no retry.
  - The frontend still shows a failed first search as "no clips" (user story 8).
