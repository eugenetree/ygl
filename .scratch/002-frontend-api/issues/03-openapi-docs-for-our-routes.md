# 03 — OpenAPI document and docs page for our routes

**What to build:** A developer building another client can open the API's docs
page, browse every route with its parameters, responses and error codes, and
download an OpenAPI document to generate a typed client in their own language.

The document is generated from the same zod contract the routes validate with,
so it cannot drift. It is served by the running API in every environment, and no
generated file is committed.

**Blocked by:** 02 — The API runs on Fastify with the contract, error shape, and validated config.

**Status:** ready-for-agent

- [ ] Fastify's swagger plugin produces an OpenAPI document from the contract schemas.
- [ ] The document is served as JSON and a browsable docs page is served, both under `/api/docs`, in every environment.
- [ ] The search route appears with its query parameters, its response schema, and the error shape with its codes.
- [ ] No generated OpenAPI file is committed to the repo.
- [ ] An inject-based test asserts the document is served and lists the search route.
