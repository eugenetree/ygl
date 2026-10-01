# 10 — saythis.co serves the frontend and the API

**What to build:** `https://saythis.co` shows the frontend, searching returns
clips, and a listener can sign in with Google and stay signed in.
`www.saythis.co` redirects to it. Both are served by Dokploy's Traefik on one
origin (ADR-0007, ADR-0008): `/api` goes to the compose app's api service,
everything else to the frontend.

The frontend is a Dokploy Application of its own, built from a Dockerfile in
`frontend/` with the repo root as its build context, so the contract import
resolves and a frontend deploy doesn't restart the scraper.

**Blocked by:** 09 — The site and the API share one origin, locally.

**Status:** ready-for-agent

- [x] `frontend/Dockerfile` builds Next's standalone output from the repo root and runs it on port 3000; it copies only `frontend/` and `src/modules/api/contract/`.
- [x] `docker build -f frontend/Dockerfile .` succeeds from the repo root and the container serves the home page.
- [ ] Still to do by hand:
  - DNS: A records for `saythis.co` and `www.saythis.co` point straight at the server, not through Cloudflare's proxy (a second hop, ADR-0007).
  - Dokploy, compose app: domain `saythis.co`, path `/api`, service `api`, port 3001, strip path off, HTTPS with Let's Encrypt.
  - Dokploy, new Application: Git source, Dockerfile `frontend/Dockerfile`, build context the repo root, watch paths `frontend/**` and `src/modules/api/contract/**`, domain `saythis.co`, path `/`, port 3000, HTTPS with Let's Encrypt, and the redirect preset from `www` to non-www.
  - Dokploy, compose app environment: set `PUBLIC_ORIGIN=https://saythis.co`, remove `API_PUBLIC_URL` and `FRONTEND_ORIGIN`.
  - Google Cloud Console: add `https://saythis.co/api/auth/callback/google` and remove the old `http://localhost:3001/...` URI.
  - Remove the Caddy leftovers from ticket 04: `docker rm caddy` and `docker volume rm saythis-saythis-trr9pp_caddy_config saythis-saythis-trr9pp_caddy_data`.
- [ ] After deploy, over HTTPS on `saythis.co`: a search returns clips, the Google round trip signs in and the avatar shows, and the API's request log shows the client's real address.
- [ ] `http://www.saythis.co` and `https://www.saythis.co` redirect permanently to `https://saythis.co`.
- [ ] `https://saythis.co/api/docs` serves the docs page, proving Traefik prefers the `/api` route over `/`.

## Comments

- If the Application's redirect preset is missing for this setup, fall back to a
  Traefik dynamic config file in Dokploy's Traefik file editor: a router on
  `Host(www.saythis.co)` with a `redirectRegex` middleware. Keep it out of
  `docker-compose.yml` (ADR-0007).
- The image serves the home page, its static chunks and a 404 on `/api`, which
  Traefik answers in production. `.dockerignore` now skips every `node_modules`
  and `frontend/.next`, so `COPY frontend/` doesn't bring the host's in.
