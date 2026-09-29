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

- [x] `npm test` discovers and runs test files rather than failing to resolve a glob
- [x] Node 24 is pinned in the repo so a fresh clone or new machine cannot silently diverge
- [x] `npm test` runs the pure suite green without Docker running and without network access
- [x] A pure-only script and a network-only script exist alongside the default
- [x] The network-dependent test is quarantined behind the `.net.test.ts` suffix and is excluded from the default suite
- [x] The redundant `.unit` infix is dropped now that the plain suffix means "pure"
- [x] All three Dockerfiles build on `node:24-alpine`
- [x] The scraper image is rebuilt and smoke-tested — yt-dlp resolves a version and fetches metadata for a known video
- [x] The bot and API images start and connect to the database

## Comments

**Implementation notes (2026-09-30)**

- Local Node was already 24.14 on the implementing machine, so the glob
  resolved; the suite ran but took ~128s and failed on a real-binary yt-dlp
  test. The pin (`.nvmrc`, `engines`, `engine-strict` in `.npmrc`) makes 24 a
  requirement rather than an accident.
- There is one multi-stage `Dockerfile`, not three files: the `builder`, `app`
  and `scraper` stages. The two `FROM` lines (the scraper stage builds `FROM
  app`) now use `node:24-alpine`.
- `yt-dlp-client.test.ts` also spawned the real yt-dlp binary in two describes
  (~20s, flaky). Those moved to `yt-dlp-client.net.test.ts`, which widens
  `.net` to "live network or an external binary". The widening, and a note that
  the suffix split may be reconsidered, are recorded in ADR-0002. What's left in
  `yt-dlp-client.test.ts` is pure.
- `npm test` is `!(*.net).test.ts`, so `.db.test.ts` files join the default run
  as soon as 02 adds them. `test:unit` excludes both `.db` and `.net`.
- Verified: `npm test` and `npm run test:unit` both pass 126/126 in ~1s under
  `sandbox-exec` with outbound IP denied, and Docker not running.
- Scraper image: node v24.21.0; `yt-dlp --version` via PATH and via the
  wrapper symlink, and the compiled `YtDlpClient.getVersion()`, all resolve
  `2026.08.19`; `curl_cffi` imports; `--print` fetches metadata for
  `Wnp_cMw_GxM`. The "No supported JavaScript runtime" warning is also present
  on the old Node 22 image, so it isn't a regression.
- App image against a throwaway `postgres:18-alpine`: all 44 migrations apply;
  the bot's `ScraperStatusWatcher` connects and `LISTEN`s, and `DatabaseClient`
  queries. The bot process itself was started with a fake Telegram token,
  because the real one would take the production bot's `getUpdates` poll.
  It gets as far as Telegram's 401.
- The API has no database dependency (only Elasticsearch; compose gives it no
  Postgres env). Verified it starts, listens on 3001, and routes requests.
- Known, pre-existing, host-only: in `npm run test:net`, `getVersion()` fails
  on macOS. The wrapper resolves `yt-dlp_macos`, a PyInstaller binary with a
  ~10s cold start, which exceeds `VERSION_RESOLUTION_TIMEOUT_MS` (5s). It
  passes inside the image. Tracked as ticket 04.
