# Search pages render on the server, which calls the API at `API_URL`

A search page (`/say/{slug}`) is rendered on the frontend's server with its
first 20 clips, their total, and the HTML that shows them. That way search
engines and link previews see the clips, the count and the caption text, not an
empty shell. The server fetches them from the API at a server-only `API_URL`:
`http://api:3001` over `dokploy-network` in production, `http://localhost:3001`
locally. It doesn't go through the public origin. Each rendered page is cached
for an hour.

This amends ADR-0008, which says the frontend calls the API by relative
`/api/...` paths. That still holds for the browser. The frontend's server is the
one caller that doesn't use them.

## Considered options

- **Search in the browser only**, as the old frontend did. The HTML would carry
  no clips. Google renders JavaScript late and in a queue, and link previews
  (Telegram, Slack, X) never run it. Rejected because the site wants to rank on
  searches for phrases.
- **The server calls `https://saythis.co/api`.** It needs no knowledge of the
  network and keeps working unchanged if the API moves to another server. But
  every render goes out through Traefik and TLS and comes back. Rejected for the
  extra hop. Switching later is a change to one env value.
- **Later batches through the Next server too** (server actions or a proxy
  route). Crawlers never page through clips, and server actions are POSTs that
  can't be cached. Rejected: the browser fetches batches after the first from
  `/api/search` directly.

## Consequences

- A search page's HTML is the same for everyone, so it can be cached by path.
  The signed-in user (`/api/me`), the accent (`?accent=`) and each video's
  captions load in the browser. Reading cookies or search params on the server
  would make every page dynamic.
- A new clip, or a change in the count, can take up to an hour to appear.
- If search is unavailable during a render, the response is an uncached 500.
  A cached page whose refresh fails keeps serving its last good version.
- The frontend's Docker build never calls the API, because search pages render
  on request.
- If the API moves to another server, `API_URL` changes. The bigger part of
  that move is the Traefik routing that keeps ADR-0008's single origin.
