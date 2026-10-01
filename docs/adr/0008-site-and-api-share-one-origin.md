# The site and the API share one origin; the API is its `/api` path

Browsers reach both the frontend and the API on one origin, `https://saythis.co`.
Traefik sends `/api/*` to the api service and everything else to the frontend,
and the frontend calls the API by relative `/api/...` paths. Locally, Next's dev
server rewrites `/api/*` to the API on port 3001, so development is same-origin
too. Since no browser ever calls the API cross-origin, the API has no CORS and
better-auth trusts only its own origin.

## Considered options

- **The API on its own subdomain** (`api.saythis.co`), the original plan. Session
  cookies still work there, since a subdomain is same-site, but it needs CORS
  with credentials naming the frontend's exact origin, a second DNS record and
  certificate, and a local setup (two ports, two origins) that differs from
  production in exactly the places cookies and CORS care about. Rejected because
  one origin removes all of that.

## Consequences

- Only a frontend served from the same origin can use cookie sign-in. A frontend
  on another origin, such as a hosted preview or a local frontend pointed at the
  production API, can't call the API until CORS is brought back.
- `/api` belongs to the API. A frontend page under `/api` would be unreachable.
- `PUBLIC_ORIGIN` names the one origin. better-auth builds the Google callback
  URL from it, so Google's authorised redirect URIs are
  `$PUBLIC_ORIGIN/api/auth/callback/google`: the frontend's port locally, not
  the API's.
