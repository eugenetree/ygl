# 04 — The API is served over HTTPS on its subdomain, through Dokploy's Traefik

**What to build:** The frontend, and anyone else, can reach the API at its own
HTTPS subdomain of the frontend's domain, with certificates issued and renewed
automatically. Today the API is bound to localhost on the server with nothing in
front of it.

Dokploy's Traefik terminates TLS and forwards to the api service over Dokploy's
Docker network. Fastify trusts exactly one proxy hop so it sees the real client
address and scheme, which later makes Secure cookies correct.

**Blocked by:** 02 — The API runs on Fastify with the contract, error shape, and validated config.

**Status:** ready-for-agent

- [x] Compose publishes no proxy of its own; routing is a Dokploy domain on the api service, port 3001.
- [x] Fastify's trust-proxy setting trusts exactly one hop.
- [x] The api service keeps its localhost port binding for local development without a proxy.
- [ ] After deploy, a search request over HTTPS to the subdomain returns clips, and the request log shows the client's real address.

## Comments

- Fastify 5.12.5 ignores a hop count: `trustProxy: 1` now trusts nobody, since
  it can't check who the peer is. The trust is a function instead: hop 0 only,
  and only from a loopback or private address (`@fastify/proxy-addr`'s
  `loopback` and `uniquelocal`). A client reaching the API directly from a
  public address can't forge `X-Forwarded-*`.
- The request log line now ends with the client's address.
- This first shipped as a Caddy service in compose publishing 80 and 443. The
  deploy failed: `dokploy-traefik` already holds both ports and routes every
  app on the server, so Caddy is gone (ADR-0007).
- Checked on the server: `dokploy-network` is `10.0.1.0/24`, so Fastify trusts
  Traefik with no code change. Dokploy's `traefik.yml` sets no
  `forwardedHeaders`, so Traefik drops a client's own `X-Forwarded-For` and
  sends only the address it saw, as Caddy did.
- No domain is attached yet. Calling the API by the server's IP works for
  `curl`, but not for the frontend: an HTTPS page can't call `http://<ip>`, and
  the `sameSite: "lax"` session cookie isn't sent cross-site.
- Still to do by hand on the server:
  - Remove what the failed deploy left: `docker rm caddy` and
    `docker volume rm saythis-saythis-trr9pp_caddy_config saythis-saythis-trr9pp_caddy_data`.
  - Once there is a domain, for the last box: point its DNS straight at the
    server (not through Cloudflare's proxy, which would be a second hop), add
    it in Dokploy → Domains on service `api`, port 3001, HTTPS with Let's
    Encrypt, and set `API_PUBLIC_URL` and the frontend's `NEXT_PUBLIC_API_URL`
    to `https://<subdomain>`.
- Known gaps, left for later:
  - IPv6 clients: without IPv6 on the Docker network, Docker's userland proxy
    forwards them and Traefik sees the gateway's address, not the client's.
  - If Docker's address pools were moved outside the private ranges, Fastify
    would stop trusting Traefik, and the log would quietly show Traefik's
    address.
