# Roadmap: YouGlish Platform (yg) — Milestone 1

**Goal:** Split the Telegram bot and scraper pipeline into two independent processes communicating via PostgreSQL.
**Granularity:** Coarse (4 phases)
**Coverage:** 24/24 v1 requirements mapped

---

## Phases

- [ ] **Phase 1: DB Schema + Infrastructure** — `scraper_control` migration, `ScraperProcess` class, `ScraperControlRepository`
- [ ] **Phase 2: Scraper Process** — standalone entry point, auto-start, command polling, state machine, heartbeat, idle-on-empty
- [ ] **Phase 3: Bot Process** — standalone entry point, persistent watcher, command handlers via `ScraperProcess`
- [ ] **Phase 4: Docker Split** — two Compose services sharing one image, grace period, health checks, pool timeout

---

## Phase Details

### Phase 1: DB Schema + Infrastructure

**Goal:** Migration, `ScraperProcess` (bot-side handle), and `ScraperControlRepository` (scraper-side writer) give both processes a typed IPC contract — no bot or scraper logic changes yet.
**Depends on:** none

### Plans

- **Plan 1.1: Migration** — write the Kysely migration that creates the `scraper_control` table with a seeded single row (`desired_state`, `actual_state`, `heartbeat_at`, `updated_at`)
- **Plan 1.2: ScraperProcess + ScraperControlRepository** — implement `ScraperProcess` (bot-side, DB queries inside: `requestStart`, `requestStop`, `requestKill`, `getStatus`) and `ScraperControlRepository` (scraper-side: `setActualState`, `updateHeartbeat`); register both in DI

### Requirements covered

IPC-01, IPC-02, IPC-03

### Success criteria

- [ ] Migration creates `scraper_control` table with exactly one seeded row
- [ ] `ScraperProcess.requestStop()` writes `desired_state = STOPPED`; `getStatus()` returns the current row
- [ ] `ScraperControlRepository.setActualState('RUNNING')` updates `actual_state` without touching `desired_state` or `heartbeat_at`
- [ ] Existing app still boots and runs against the migrated schema without errors

---

### Phase 2: Scraper Process

**Goal:** Scraper runs as a standalone Node.js process that auto-starts on boot, polls for stop signals, writes state transitions and heartbeats, recovers stranded jobs, and idles when the queue is empty.
**Depends on:** Phase 1

### Plans

- **Plan 2.1: Standalone Entry Point + Auto-start** — create `src/scraper/main.ts` with minimal InversifyJS container (no `TelegramBot`, no Telegraf); wire `ScraperOrchestrator` + `ScraperControlRepository`; on boot run recovery query then auto-start orchestrator writing STARTING → RUNNING
- **Plan 2.2: Command Polling + Idle Loop** — integrate DB polling for STOP/KILL signals, graceful drain on STOP, `process.exit(0)` on KILL, heartbeat writes each iteration, idle-sleep-retry when queue empty, SIGTERM handler with 5-minute hard timeout

### Requirements covered

SCRP-01, SCRP-02, SCRP-03, SCRP-04, SCRP-05, SCRP-06, SCRP-07, SCRP-08

### Success criteria

- [ ] `node dist/src/scraper/main.js` starts, writes `actual_state = RUNNING`, and does not import `TelegramBot` or Telegraf
- [ ] On startup, jobs in `PROCESSING` state are reset to `PENDING` before the orchestrator starts
- [ ] Setting `desired_state = STOPPED` causes scraper to finish current item and write `actual_state = STOPPED` without killing mid-job
- [ ] Setting `desired_state = KILLED` causes immediate `process.exit(0)`
- [ ] When queue is empty, scraper stays alive, `actual_state` remains RUNNING, and `heartbeat_at` keeps updating
- [ ] SIGTERM writes final state to DB and exits cleanly within the grace window

---

### Phase 3: Bot Process

**Goal:** Bot runs as a standalone process with a persistent state watcher that notifies on all state changes — covering manual commands and auto-start on deployment.
**Depends on:** Phase 2

### Plans

- **Plan 3.1: Standalone Entry Point + Persistent Watcher** — create `src/bot/main.ts` with minimal InversifyJS container (no `ScraperOrchestrator`, no workers, no `YtDlpClient`); wire `TelegramBot` + `ScraperProcess`; launch persistent background poll on startup that watches `actual_state` and sends Telegram notifications on transitions
- **Plan 3.2: Command Handlers** — rewrite `LifecycleController` to call `ScraperProcess` methods; update `StatsController` and config commands to read state via `ScraperProcess.getStatus()`

### Requirements covered

BOT-01, BOT-02, BOT-03, BOT-04, BOT-05, BOT-06, BOT-07

### Success criteria

- [ ] `node dist/src/bot/main.js` starts without importing `ScraperOrchestrator`, workers, or `YtDlpClient`
- [ ] When scraper container starts (simulating deployment), bot sends a Telegram notification without any manual command
- [ ] `/stop` replies immediately with ack; bot sends follow-up when `actual_state` reaches STOPPED
- [ ] `/kill` replies with fire-and-forget ack; no follow-up sent
- [ ] A bot crash leaves the scraper running; scraper `heartbeat_at` continues updating
- [ ] `/stats` returns current state read from `scraper_control`

---

### Phase 4: Docker Split

**Goal:** Both processes run as independent containers from a single image, restart independently on crash, and handle DB outages and graceful shutdown correctly.
**Depends on:** Phase 3

### Plans

- **Plan 4.1: Compose Services + Dockerfile** — define `bot` and `scraper` services in `docker-compose.yml` sharing one built image (differing only in `command:`); set `stop_grace_period: 180s` on scraper; add `restart: unless-stopped`; fix Dockerfile `CMD` to array form for PID 1 signal delivery
- **Plan 4.2: Health Checks + Pool Timeout** — add `healthcheck` to `db` service; add `depends_on: db: condition: service_healthy` to both app services; set `connectionTimeoutMillis: 5000` in PostgreSQL pool config

### Requirements covered

DOCK-01, DOCK-02, DOCK-03, DOCK-04, DOCK-05, DOCK-06

### Success criteria

- [ ] `docker compose up --build` starts three containers (`bot`, `scraper`, `db`); both reach running state
- [ ] `docker compose kill scraper` restarts only the scraper; bot continues responding to commands
- [ ] `docker compose kill bot` restarts only the bot; scraper `heartbeat_at` keeps updating
- [ ] `docker compose stop scraper` sends SIGTERM; scraper writes `actual_state = STOPPED` before exiting within grace period
- [ ] DB temporarily unavailable → connection pool fails within ~5 seconds rather than hanging

---

## Progress

| Phase | Plans Complete | Status |
|-------|----------------|--------|
| 1. DB Schema + Infrastructure | 0/2 | Not started |
| 2. Scraper Process | 0/2 | Not started |
| 3. Bot Process | 0/2 | Not started |
| 4. Docker Split | 0/2 | Not started |

---

*Roadmap created: 2026-04-07*
*Last updated: 2026-04-08 — ScraperProcess class, auto-start on boot, persistent watcher, idle-on-empty queue*
