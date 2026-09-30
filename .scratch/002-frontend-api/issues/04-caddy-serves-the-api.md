# 04 — Caddy serves the API over HTTPS on its subdomain

**What to build:** The frontend, and anyone else, can reach the API at its own
HTTPS subdomain of the frontend's domain, with certificates issued and renewed
automatically. Today the API is bound to localhost on the server with nothing in
front of it.

A Caddy service in compose terminates TLS and forwards to the api service over
the compose network. Fastify trusts exactly one proxy hop so it sees the real
client address and scheme, which later makes Secure cookies correct.

**Blocked by:** 02 — The API runs on Fastify with the contract, error shape, and validated config.

**Status:** ready-for-agent

- [x] Compose has a Caddy service publishing 80 and 443, with its config in the repo.
- [x] The API's subdomain comes from an env variable listed in the example env file.
- [x] Caddy forwards the subdomain to the api service over the compose network, and persists its certificates in a volume.
- [x] Fastify's trust-proxy setting trusts exactly one hop.
- [x] The api service keeps its localhost port binding for local development without Caddy.
- [ ] After deploy, a search request over HTTPS to the subdomain returns clips, and the request log shows the client's real address.

## Comments

- Fastify 5.12.5 ignores a hop count: `trustProxy: 1` now trusts nobody, since
  it can't check who the peer is. The trust is a function instead: hop 0 only,
  and only from a loopback or private address (`@fastify/proxy-addr`'s
  `loopback` and `uniquelocal`). A client reaching the API directly from a
  public address can't forge `X-Forwarded-*`.
- Caddy replaces a client's own `X-Forwarded-For` rather than appending to it,
  so the one entry Fastify trusts is the address Caddy saw.
- The request log line now ends with the client's address.
- `API_DOMAIN` is optional in compose, like `FRONTEND_ORIGIN`, so a stack
  without the API still starts. When it is empty, a guard stops Caddy with the
  variable's name, since Caddy's own error (`unrecognized global option:
  reverse_proxy`) doesn't give it. With `restart: always`, Caddy keeps
  restarting until it is set.
- 443/udp is published too, for HTTP/3.
- Checked by hand on an isolated Docker network with a seeded index: a search
  over HTTPS through Caddy returns clips over HTTP/2, HTTP redirects with a 308,
  the API logs the address Caddy saw rather than Caddy's own, and a forged
  `X-Forwarded-For` sent to Caddy is replaced.
- Still to do by hand for the last box: point the subdomain's DNS at the server,
  open TCP 80 and 443 and UDP 443, set `API_DOMAIN` in the server's `.env`, and
  point the frontend's `NEXT_PUBLIC_API_URL` at `https://<API_DOMAIN>`.
- Known gaps, left for later:
  - IPv6 clients: without IPv6 on the compose network, Docker's userland proxy
    forwards them and Caddy sees the gateway's address, not the client's.
  - `make rebuild-fresh` runs `down -v`, which wipes `caddy_data` and so
    re-issues the certificate.
  - If Docker's address pools were moved outside the private ranges, Fastify
    would stop trusting Caddy, and the log would quietly show Caddy's address.
  - 05 adds the API's public URL, which is `https://` plus `API_DOMAIN`, so one
    could be derived from the other.
