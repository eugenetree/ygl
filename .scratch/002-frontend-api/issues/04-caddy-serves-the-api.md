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

- [ ] Compose has a Caddy service publishing 80 and 443, with its config in the repo.
- [ ] The API's subdomain comes from an env variable listed in the example env file.
- [ ] Caddy forwards the subdomain to the api service over the compose network, and persists its certificates in a volume.
- [ ] Fastify's trust-proxy setting trusts exactly one hop.
- [ ] The api service keeps its localhost port binding for local development without Caddy.
- [ ] After deploy, a search request over HTTPS to the subdomain returns clips, and the request log shows the client's real address.
