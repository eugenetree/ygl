# 07 — Auth routes appear in the OpenAPI docs

**What to build:** A developer reading the API's docs page sees the sign-in,
sign-out, callback and account deletion routes alongside search and who-am-I, so
the whole API surface is in one document and one generated client.

better-auth's routes are not Fastify schemas, so they do not appear on their
own. better-auth's OpenAPI plugin produces a document for them, which is merged
into the one the API already serves.

**Blocked by:** 03 — OpenAPI document and docs page for our routes; 05 — Listeners sign in with Google.

**Status:** ready-for-agent

- [ ] better-auth's OpenAPI plugin is enabled.
- [ ] Its paths and schemas are merged into the single OpenAPI document served under `/api/docs`, without name clashes.
- [ ] Only the routes this API actually enables appear; email and password routes do not.
- [ ] `/api/me` appears with its signed-in requirement.
- [ ] The inject-based docs test also asserts an auth route is listed.
