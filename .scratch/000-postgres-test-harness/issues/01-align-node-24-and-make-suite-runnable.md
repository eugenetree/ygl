# 01 — Align the runtime on Node 24 and make the test suite actually run

**What to build:** A developer can run `npm test` and see tests execute. Today
the command exits with `Could not find '…/src/**/*.test.ts'` — Node 18's test
runner has no glob support — so the suite has never run, on any machine, ever.
After this ticket the pure-logic suite runs green with no Docker and no network,
and the runtime a developer tests on is the runtime the project ships.

Test files declare the infrastructure they need in their filename: plain
`*.test.ts` is pure, `*.db.test.ts` needs the Postgres container (none exist
yet), `*.net.test.ts` needs live network. The current naming is inverted — the
plain-suffixed `yt-api-get-video` test is the one that hits real YouTube with
60-second timeouts, while the `.unit`-suffixed sibling is the pure one — so a
developer running the default suite gets network flakiness for unrelated
changes. That inversion is corrected here.

Runtime alignment covers local and container in one move, so no divergence is
created in either direction. `Dockerfile.scraper` carries yt-dlp and the most
native surface; it is the one that must be proven, not assumed.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] `npm test` discovers and runs test files rather than failing to resolve a glob
- [ ] Node 24 is pinned in the repo so a fresh clone or new machine cannot silently diverge
- [ ] `npm test` runs the pure suite green without Docker running and without network access
- [ ] A pure-only script and a network-only script exist alongside the default
- [ ] The network-dependent test is quarantined behind the `.net.test.ts` suffix and is excluded from the default suite
- [ ] The redundant `.unit` infix is dropped now that the plain suffix means "pure"
- [ ] All three Dockerfiles build on `node:24-alpine`
- [ ] The scraper image is rebuilt and smoke-tested — yt-dlp resolves a version and fetches metadata for a known video
- [ ] The bot and API images start and connect to the database
