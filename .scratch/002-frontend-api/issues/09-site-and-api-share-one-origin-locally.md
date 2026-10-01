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

- [x] `API_PUBLIC_URL` is renamed `PUBLIC_ORIGIN` in the config schema, `ApiConfig`, `createAuth`'s settings (`apiPublicUrl` → `publicOrigin`), compose and `.env.example`, which explains it as the origin browsers reach the site and the API on: `http://localhost:3000` locally, `https://saythis.co` in production.
- [x] `FRONTEND_ORIGIN` is removed from the config schema, compose and `.env.example`.
- [x] The CORS plugin, its registration, its tests and the `@fastify/cors` dependency are removed.
- [x] better-auth's `trustedOrigins` is removed; it trusts its own `baseURL`, which is `PUBLIC_ORIGIN`.
- [x] The frontend calls the API by relative paths: `NEXT_PUBLIC_API_URL` and `API_BASE` are gone, and the auth client relies on the page's own origin.
- [x] `next.config.mjs` rewrites `/api/:path*` to `http://localhost:3001/api/:path*` in development only; a production build has no rewrite.
- [ ] Checked by hand that, through the rewrite, better-auth sees `localhost:3000` as the request's host and the session cookie is set on it.
- [x] The tests use the one origin too: `TEST_AUTH_SETTINGS` in `src/modules/auth/testing/test-auth.ts` drops `frontendOrigin` and sets `publicOrigin`, and the `origin` headers and callback URLs in `http-server.test.ts` and `account.db.test.ts` use it.
- [x] Every `saythis.cc` becomes `saythis.co`: the logo in `GentleHome` and `GentleResults`, the config examples, the OpenAPI title and the test origins.
- [ ] `.env.example`'s Google note names `$PUBLIC_ORIGIN/api/auth/callback/google`, e.g. `http://localhost:3000/api/auth/callback/google`, and that URI is registered on the Google client.
- [ ] The Google OAuth round trip, search and sign-out are checked by hand on `localhost:3000`, with no request to `:3001` in the browser's network tab.

## Comments

- Checked through the rewrite, with the built API on :3001 against a throwaway
  Postgres and a fake Google client: the API sees `x-forwarded-host:
  localhost:3000`; `sign-in/social` from `http://localhost:3000` answers with
  Google's `redirect_uri=http://localhost:3000/api/auth/callback/google` and its
  state cookie lands on :3000; a request from another origin carrying a cookie
  gets 403, and a `callbackURL` on another origin gets `INVALID_CALLBACK_URL`.
  The session cookie itself needs Google's callback, so that half of the box
  waits for the round trip.
- `next build` has no rewrites and no `localhost:3001` in its bundles.
- Left by hand, needing the real Google client: register
  `http://localhost:3000/api/auth/callback/google` on it, then sign in, search
  and sign out on `localhost:3000` with the network tab open. The local `.env`
  needs `PUBLIC_ORIGIN`, `BETTER_AUTH_SECRET` and the Google client to run the API.
