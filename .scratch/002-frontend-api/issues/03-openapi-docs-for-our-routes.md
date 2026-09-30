# 03 — OpenAPI document and docs page for our routes

**What to build:** A developer building another client can open the API's docs
page, browse every route with its parameters, responses and error codes, and
download an OpenAPI document to generate a typed client in their own language.

The document is generated from the same zod contract the routes validate with,
so it cannot drift. It is served by the running API in every environment, and no
generated file is committed.

**Blocked by:** 02 — The API runs on Fastify with the contract, error shape, and validated config.

**Status:** ready-for-agent

- [x] Fastify's swagger plugin produces an OpenAPI document from the contract schemas.
- [x] The document is served as JSON and a browsable docs page is served, both under `/api/docs`, in every environment.
- [x] The search route appears with its query parameters, its response schema, and the error shape with its codes.
- [x] No generated OpenAPI file is committed to the repo.
- [x] An inject-based test asserts the document is served and lists the search route.

## Comments

- The docs page is `@fastify/swagger-ui` at `/api/docs`; the document is at
  `/api/docs/json` (and `/api/docs/yaml`).
- The document is OpenAPI 3.0.3, so a zod literal renders as a one-value
  `enum` rather than `const`.
- Each error status declares only the code it can carry (`errorSchemaFor`),
  so a generated client does not see `NOT_FOUND` on search or
  `SEARCH_UNAVAILABLE` on a 500.
- The `offset + limit` cap can't be written as an OpenAPI schema; it appears
  as the description of both parameters.
