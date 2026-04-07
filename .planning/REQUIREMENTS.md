# Requirements: YouGlish-like Platform (yg) — Milestone 1

**Defined:** 2026-04-07
**Core Value:** Scraping pipeline and Telegram bot run as independent processes — a crash in one does not affect the other.

## v1 Requirements

### IPC Infrastructure

- [ ] **IPC-01**: A `scraper_control` table exists with a single row containing: `desired_state` (STOPPED/KILLED — written by bot, only used for stop signals), `actual_state` (IDLE/STARTING/RUNNING/STOPPING/STOPPED/ERROR — written by scraper), `heartbeat_at` (updated by scraper each loop iteration), `updated_at`.
- [ ] **IPC-02**: A `ScraperProcess` class (bot-side, DB queries inside) with methods: `requestStop()`, `requestKill()`, `requestStart()`, `getStatus()`. Not a repository — a concrete handle to the scraper process that currently uses PostgreSQL.
- [ ] **IPC-03**: A `ScraperControlRepository` (scraper-side) with methods: `setActualState(state)`, `updateHeartbeat()`. Used only by the scraper process to write its own state.

### Scraper Process

- [ ] **SCRP-01**: A standalone scraper entry point (`src/scraper/main.ts`) bootstraps a minimal InversifyJS container — no `TelegramBot`, no `Telegraf`, no `LifecycleController`.
- [ ] **SCRP-02**: On startup, scraper runs a recovery query that resets all jobs in `PROCESSING` state back to `PENDING` (handles stranded jobs from a previous crash).
- [ ] **SCRP-03**: Scraper always auto-starts on container boot — no `desired_state` check needed to begin. Writes `actual_state = STARTING` then `actual_state = RUNNING`.
- [ ] **SCRP-04**: Scraper polls `scraper_control.desired_state` every 5 seconds for stop signals. When `desired_state = STOPPED`, sets `actual_state = STOPPING`, waits for current item to finish (graceful drain), then sets `actual_state = STOPPED`.
- [ ] **SCRP-05**: When `desired_state = KILLED`, scraper calls `process.exit(0)` immediately — no drain, no final state write.
- [ ] **SCRP-06**: When the queue is empty, the orchestrator does not stop — it sleeps and retries. The scraper only stops via STOP/KILL commands or SIGTERM.
- [ ] **SCRP-07**: Scraper writes `heartbeat_at` to `scraper_control` on each orchestrator loop iteration.
- [ ] **SCRP-08**: SIGTERM handler sets graceful-stop flag, awaits loop completion with 5-minute hard timeout, writes final state to DB, then exits.

### Bot Process

- [ ] **BOT-01**: A standalone bot entry point (`src/bot/main.ts`) bootstraps a minimal InversifyJS container — no `ScraperOrchestrator`, no workers, no `YtDlpClient`.
- [ ] **BOT-02**: Bot runs a persistent background watcher on startup that polls `scraper_control.actual_state` every 5 seconds, tracks last known state, and sends a Telegram notification on any state transition (RUNNING, STOPPED, ERROR, etc.). Covers all state changes — manual commands and auto-start on deployment.
- [ ] **BOT-03**: `/start` command calls `ScraperProcess.requestStart()` (sets `desired_state = RUNNING`) and immediately replies with an ack. The persistent watcher handles the follow-up notification when `actual_state` reaches RUNNING.
- [ ] **BOT-04**: `/stop` command calls `ScraperProcess.requestStop()` and immediately replies with an ack. The persistent watcher handles the follow-up notification when `actual_state` reaches STOPPED.
- [ ] **BOT-05**: `/kill` command calls `ScraperProcess.requestKill()` and immediately replies with a fire-and-forget ack.
- [ ] **BOT-06**: `/restart` command calls `requestStop()`, waits for `actual_state = STOPPED`, then calls `requestStart()`. Sends ack immediately; watcher handles follow-up.
- [ ] **BOT-07**: `/stats` and config commands read scraper state from `ScraperProcess.getStatus()`.

### Docker Infrastructure

- [ ] **DOCK-01**: `docker-compose.yml` defines two services (`bot` and `scraper`) that share one built image and differ only in their `command:` (`node dist/src/bot/main.js` vs `node dist/src/scraper/main.js`).
- [ ] **DOCK-02**: Scraper service has `stop_grace_period: 180s` to allow yt-dlp downloads to complete before SIGKILL.
- [ ] **DOCK-03**: Both services use `restart: unless-stopped` so each restarts independently on crash.
- [ ] **DOCK-04**: Both services depend on `db` with `condition: service_healthy`; `db` service has a `healthcheck` defined.
- [ ] **DOCK-05**: PostgreSQL connection pool sets `connectionTimeoutMillis: 5000` so DB outages fail fast instead of hanging forever.
- [ ] **DOCK-06**: Dockerfile `CMD` uses array form (`["node", "..."]`) so Node.js is PID 1 and receives SIGTERM directly from Docker.

## v2 Requirements

### Monitoring

- **MON-01**: Bot detects UNREACHABLE state — if `heartbeat_at` is stale beyond a configured threshold, bot sends an alert message.
- **MON-02**: Per-scraper granularity in status (which of the 4 pipeline stages is running/stuck).

### End-User Product

- **WEB-01**: Search API — query Elasticsearch captions, return video_id + timestamp matches.
- **WEB-02**: Next.js web app — search bar, YouTube embed at matched timestamp, prev/next navigation.
- **WEB-03**: Transcript display alongside video with searched word highlighted.

## Out of Scope

| Feature | Reason |
|---------|--------|
| UNREACHABLE heartbeat detection | Nice-to-have hardening; deferred to v2 |
| End-user web app | Future milestone; scraper must work reliably first |
| Redis pub/sub | No new infra — PostgreSQL IPC is sufficient |
| Per-scraper granular status | Overkill for now; orchestrator-level state is enough |
| Multi-language support | English only for current milestone |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| IPC-01 | Phase 1 | Pending |
| IPC-02 | Phase 1 | Pending |
| IPC-03 | Phase 1 | Pending |
| SCRP-01 | Phase 2 | Pending |
| SCRP-02 | Phase 2 | Pending |
| SCRP-03 | Phase 2 | Pending |
| SCRP-04 | Phase 2 | Pending |
| SCRP-05 | Phase 2 | Pending |
| SCRP-06 | Phase 2 | Pending |
| SCRP-07 | Phase 2 | Pending |
| SCRP-08 | Phase 2 | Pending |
| BOT-01 | Phase 3 | Pending |
| BOT-02 | Phase 3 | Pending |
| BOT-03 | Phase 3 | Pending |
| BOT-04 | Phase 3 | Pending |
| BOT-05 | Phase 3 | Pending |
| BOT-06 | Phase 3 | Pending |
| BOT-07 | Phase 3 | Pending |
| DOCK-01 | Phase 4 | Pending |
| DOCK-02 | Phase 4 | Pending |
| DOCK-03 | Phase 4 | Pending |
| DOCK-04 | Phase 4 | Pending |
| DOCK-05 | Phase 4 | Pending |
| DOCK-06 | Phase 4 | Pending |

**Coverage:**
- v1 requirements: 24 total
- Mapped to phases: 24
- Unmapped: 0 ✓

---
*Requirements defined: 2026-04-07*
*Last updated: 2026-04-08 — ScraperProcess class, auto-start on boot, persistent watcher, idle-on-empty queue*
