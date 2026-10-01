# 09 — The site and the API share one origin, locally

**What to build:** On `localhost:3000` a listener can search, sign in with
Google, see who they are signed in as, and sign out, and the browser never
sends a request anywhere but `localhost:3000`. The frontend calls the API by
relative `/api/...` paths, and `next dev` rewrites them to the API on port 3001.
Production will route the same paths through Traefik (ticket 10), so local
development behaves like production for cookies and origins.

Since no browser calls the API cross-origin any more, CORS goes, and the API's
one origin setting is renamed to say what it now is. The domain becomes
`saythis.co` everywhere.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] `API_PUBLIC_URL` is renamed `PUBLIC_ORIGIN` in the config schema, `ApiConfig`, `createAuth`'s settings (`apiPublicUrl` → `publicOrigin`), compose and `.env.example`, which explains it as the origin browsers reach the site and the API on: `http://localhost:3000` locally, `https://saythis.co` in production.
- [ ] `FRONTEND_ORIGIN` is removed from the config schema, compose and `.env.example`.
- [ ] The CORS plugin, its registration, its tests and the `@fastify/cors` dependency are removed.
- [ ] better-auth's `trustedOrigins` is removed; it trusts its own `baseURL`, which is `PUBLIC_ORIGIN`.
- [ ] The frontend calls the API by relative paths: `NEXT_PUBLIC_API_URL` and `API_BASE` are gone, and the auth client relies on the page's own origin.
- [ ] `next.config.mjs` rewrites `/api/:path*` to `http://localhost:3001/api/:path*` in development only; a production build has no rewrite.
- [ ] Checked by hand that, through the rewrite, better-auth sees `localhost:3000` as the request's host and the session cookie is set on it.
- [ ] The tests use the one origin too: `TEST_AUTH_SETTINGS` in `src/modules/auth/testing/test-auth.ts` drops `frontendOrigin` and sets `publicOrigin`, and the `origin` headers and callback URLs in `http-server.test.ts` and `account.db.test.ts` use it.
- [ ] Every `saythis.cc` becomes `saythis.co`: the logo in `GentleHome` and `GentleResults`, the config examples, the OpenAPI title and the test origins.
- [ ] `.env.example`'s Google note names `$PUBLIC_ORIGIN/api/auth/callback/google`, e.g. `http://localhost:3000/api/auth/callback/google`, and that URI is registered on the Google client.
- [ ] The Google OAuth round trip, search and sign-out are checked by hand on `localhost:3000`, with no request to `:3001` in the browser's network tab.
