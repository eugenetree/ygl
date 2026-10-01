# Dokploy's Traefik routes the API; compose has no proxy of its own

The API reaches the internet through the Traefik that Dokploy runs on the
server (`dokploy-traefik`). Its subdomain is a Dokploy domain on the `api`
service, port 3001, and Traefik issues and renews the certificate. Compose
publishes no 80 or 443 and has no reverse proxy service, so the routing lives
in Dokploy's settings, not in this repo.

## Why

Dokploy's Traefik holds 80 and 443 on the host and routes every app deployed
there. A proxy of our own in compose can't bind those ports: the first one, a
Caddy service, failed its deploy with `Bind for 0.0.0.0:80 failed: port is
already allocated`.

## Considered alternatives

- **Caddy in compose, on 80 and 443** — keeps routing and certificates in the
  repo and works on any plain Docker host. Rejected: it would mean stopping
  Dokploy's Traefik, which breaks routing for everything else Dokploy serves.
- **Caddy in compose on other ports, behind Traefik** — a second hop that
  Fastify's one-hop trust would have to account for, for no gain over pointing
  Traefik at the API directly.

## Consequences

- Fastify trusts one proxy hop from a private address. Traefik reaches the API
  over `dokploy-network` (`10.0.1.0/24`), so it qualifies. Moving that network
  outside the private ranges, or putting a second proxy such as Cloudflare's in
  front, would make the API log the proxy's address instead of the client's.
- Traefik replaces a client's own `X-Forwarded-For` only while Dokploy's
  `traefik.yml` sets no `forwardedHeaders.trustedIPs` or `insecure`.
- Moving off Dokploy means bringing a proxy back into compose.
