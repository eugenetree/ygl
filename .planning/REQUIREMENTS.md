# Requirements: YouGlish-like Platform (yg) — Milestone 1

**Defined:** 2026-04-07
**Core Value:** Scraping pipeline and Telegram bot run as independent processes — a crash in one does not affect the other.

## v1 Requirements

### IPC Infrastructure

- [ ] **IPC-01**: A `scraper_control` table exists with a single row containing: `desired_state` (RUNNING/STOPPED/KILLED — written by bot), `actual_state` (IDLE/STARTING/RUNNING/STOPPING/STOPPED/ERROR — written by scraper), `heartbeat_at` (updated by scraper each loop iteration), `updated_at`.
- [ ] **IPC-02**: A `ScraperControlRepository` with Kysely-typed methods: `getState()`, `setDesiredState(state)`, `setActualState(state)`, `updateHeartbeat()`.
- [ ] **IPC-03**: Duplicate commands are idempotent by design — if `desired_state` already matches the requested state, the bot replies with the current state (e.g., "Scraper is already running.") and does not modify the row.

### Scraper Process

- [ ] **SCRP-01**: A standalone scraper entry point (`src/scraper/main.ts`) bootstraps a minimal InversifyJS container — no `TelegramBot`, no `Telegraf`, no `LifecycleController`.
- [ ] **SCRP-02**: On startup, scraper runs a recovery query that resets all jobs in `PROCESSING` state back to `PENDING` (handles stranded jobs from a previous crash).
- [ ] **SCRP-03**: Scraper polls `scraper_control.desired_state` every 5 seconds; when `desired_state = RUNNING` and `actual_state = IDLE/STOPPED`, sets `actual_state = STARTING` → starts orchestrator → sets `actual_state = RUNNING`.
- [ ] **SCRP-04**: When `desired_state = STOPPED` and `actual_state = RUNNING`, scraper sets `actual_state = STOPPING`, waits for current item to finish (graceful drain), then sets `actual_state = STOPPED`.
- [ ] **SCRP-05**: When `desired_state = KILLED`, scraper calls `process.exit(0)` immediately — no drain, no final state write.
- [ ] **SCRP-06**: Scraper writes `heartbeat_at` to `scraper_control` on each orchestrator loop iteration.
- [ ] **SCRP-07**: SIGTERM handler in scraper process sets graceful-stop flag, awaits loop completion with 5-minute hard timeout, writes final state to DB, then exits.

### Bot Process

- [ ] **BOT-01**: A standalone bot entry point (`src/bot/main.ts`) bootstraps a minimal InversifyJS container — no `ScraperOrchestrator`, no workers, no `YtDlpClient`.
- [ ] **BOT-02**: `/start` command sets `scraper_control.desired_state = RUNNING` and immediately replies with an ack. A detached poll watches `actual_state`; sends a follow-up when it reaches RUNNING (or ERROR).
- [ ] **BOT-03**: `/stop` command sets `scraper_control.desired_state = STOPPED` and immediately replies with an ack. A detached poll watches `actual_state`; sends a follow-up when it reaches STOPPED (or ERROR).
- [ ] **BOT-04**: `/kill` command sets `scraper_control.desired_state = KILLED` and immediately replies with a fire-and-forget ack. No follow-up poll (process exits immediately and may not update state).
- [ ] **BOT-05**: `/restart` command sets `desired_state = STOPPED`, polls until `actual_state = STOPPED`, then sets `desired_state = RUNNING`. Sends ack immediately, follow-up when RUNNING.
- [ ] **BOT-06**: `/stats` and config commands read scraper state from `scraper_control` (instead of in-process `isRunning` boolean).
- [ ] **BOT-07**: Follow-up polls have a 10-minute timeout; if state doesn't confirm within timeout, bot sends a "timed out — scraper may have crashed" message.

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
- v1 requirements: 23 total
- Mapped to phases: 23
- Unmapped: 0 ✓

---
*Requirements defined: 2026-04-07*
*Last updated: 2026-04-07 after initial definition*
