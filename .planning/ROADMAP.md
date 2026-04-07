# Roadmap: YouGlish Platform (yg) — Milestone 1

**Goal:** Split the Telegram bot and scraper pipeline into two independent processes communicating via PostgreSQL.
**Granularity:** Coarse (4 phases)
**Coverage:** 23/23 v1 requirements mapped

---

## Phases

- [ ] **Phase 1: DB Schema + Repository** — `scraper_control` migration and `ScraperControlRepository`
- [ ] **Phase 2: Scraper Process** — standalone entry point, command polling, state writes, heartbeat, startup recovery
- [ ] **Phase 3: Bot Process** — standalone entry point, DB-backed commands, detached follow-up polls
- [ ] **Phase 4: Docker Split** — two Compose services sharing one image, grace period, health checks, pool timeout

---

## Phase Details

### Phase 1: DB Schema + Repository

**Goal:** A migration and typed repository give both processes a shared IPC contract — no bot or scraper code changes yet.
**Depends on:** none

### Plans

- **Plan 1.1: Migration** — write the Kysely migration that creates the `scraper_control` table with a seeded single row (`desired_state`, `actual_state`, `heartbeat_at`, `updated_at`)
- **Plan 1.2: ScraperControlRepository** — implement `getState()`, `setDesiredState()`, `setActualState()`, `updateHeartbeat()` with Kysely-typed methods and Result return types; register in DI

### Requirements covered

IPC-01, IPC-02, IPC-03

### Success criteria

- [ ] Running the migration against a clean DB creates the `scraper_control` table with exactly one row and default values
- [ ] `ScraperControlRepository.setDesiredState('RUNNING')` followed by `getState()` returns `desired_state = 'RUNNING'` in a unit/integration test
- [ ] Calling `setDesiredState` with the already-current value (duplicate command) is a no-op and `getState()` reflects unchanged state (IPC-03 idempotency)
- [ ] Existing app still boots and runs against the migrated schema without errors

---

### Phase 2: Scraper Process

**Goal:** The scraper runs as a standalone Node.js process that polls `scraper_control` for commands, writes state transitions and heartbeats, and recovers stranded jobs on startup.
**Depends on:** Phase 1

### Plans

- **Plan 2.1: Standalone Entry Point** — create `src/scraper/main.ts` with a minimal InversifyJS container (no `TelegramBot`, no Telegraf, no `LifecycleController`); wire `ScraperOrchestrator` + `ScraperControlRepository` + all workers
- **Plan 2.2: Command Polling + State Machine** — integrate DB polling into the orchestrator loop (RUNNING/STOPPED/KILLED transitions), startup recovery query, heartbeat writes, and SIGTERM handler with 5-minute hard timeout

### Requirements covered

SCRP-01, SCRP-02, SCRP-03, SCRP-04, SCRP-05, SCRP-06, SCRP-07

### Success criteria

- [ ] `node dist/src/scraper/main.js` starts without importing anything from `src/bot/` or Telegraf; container resolution does not require `YtDlpClient` to be absent but does not load `TelegramBot`
- [ ] On startup, any jobs in `PROCESSING` state are reset to `PENDING` before the command poll loop begins
- [ ] Setting `desired_state = RUNNING` in the DB causes `actual_state` to transition IDLE → STARTING → RUNNING within the poll interval (observable via `getState()`)
- [ ] Setting `desired_state = STOPPED` while scraper is running causes it to finish the current item and transition to `actual_state = STOPPED` without killing mid-job
- [ ] Sending SIGTERM to the scraper process writes `actual_state = STOPPED` (or ERROR on timeout) to the DB and exits cleanly within the grace window
- [ ] `heartbeat_at` is updated on each loop iteration while the scraper is RUNNING

---

### Phase 3: Bot Process

**Goal:** The bot runs as a standalone Node.js process that issues commands via `scraper_control`, sends immediate acks, and delivers follow-up messages when the scraper confirms state changes.
**Depends on:** Phase 2

### Plans

- **Plan 3.1: Standalone Entry Point** — create `src/bot/main.ts` with a minimal InversifyJS container (no `ScraperOrchestrator`, no workers, no `YtDlpClient`); wire `TelegramBot` + `ScraperControlRepository` + `TelegramNotifier`
- **Plan 3.2: Command Handlers + Follow-up Polls** — rewrite `LifecycleController` to write commands via repository and launch detached `watchForStateChange` polls; update `StatsController` and config commands to read `scraper_control` instead of in-process state

### Requirements covered

BOT-01, BOT-02, BOT-03, BOT-04, BOT-05, BOT-06, BOT-07

### Success criteria

- [ ] `node dist/src/bot/main.js` starts without importing anything from `src/scraper/`; container does not resolve `ScraperOrchestrator` or `YtDlpClient`
- [ ] `/start` replies immediately with an ack, then sends a second message when `actual_state` reaches RUNNING (verified end-to-end with both processes running)
- [ ] `/stop` replies immediately with an ack, then sends a follow-up when `actual_state` reaches STOPPED
- [ ] `/kill` replies immediately with a fire-and-forget ack and sends no follow-up
- [ ] `/restart` sequences the STOPPED wait then RUNNING poll and sends one follow-up message on success
- [ ] A bot crash (kill -9 on the bot process) leaves the scraper running unaffected; scraper `heartbeat_at` continues updating
- [ ] If `actual_state` does not reach the expected state within 10 minutes, bot sends a timeout warning message

---

### Phase 4: Docker Split

**Goal:** Both processes run as independent containers from a single image, restart independently on crash, and handle DB outages and graceful shutdown correctly.
**Depends on:** Phase 3

### Plans

- **Plan 4.1: Compose Services + Dockerfile** — define `bot` and `scraper` services in `docker-compose.yml` sharing one built image (differing only in `command:`); set `stop_grace_period: 180s` on scraper; add `restart: unless-stopped`; fix Dockerfile `CMD` to array form for PID 1 signal delivery
- **Plan 4.2: Health Checks + Pool Timeout** — add `healthcheck` to the `db` service; add `depends_on: db: condition: service_healthy` to both app services; set `connectionTimeoutMillis: 5000` in the PostgreSQL pool config

### Requirements covered

DOCK-01, DOCK-02, DOCK-03, DOCK-04, DOCK-05, DOCK-06

### Success criteria

- [ ] `docker compose up --build` starts three containers (`bot`, `scraper`, `db`); both app containers reach a running state and connect to the DB
- [ ] `docker compose kill scraper` restarts only the scraper container; the bot container continues polling Telegram and responding to commands
- [ ] `docker compose kill bot` restarts only the bot container; the scraper container continues running and `heartbeat_at` keeps updating
- [ ] `docker compose stop scraper` sends SIGTERM to the scraper; the scraper writes `actual_state = STOPPED` before the container exits (within the grace period)
- [ ] When the DB is temporarily unavailable, the connection pool fails with a timeout error within ~5 seconds rather than hanging indefinitely

---

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. DB Schema + Repository | 0/2 | Not started | - |
| 2. Scraper Process | 0/2 | Not started | - |
| 3. Bot Process | 0/2 | Not started | - |
| 4. Docker Split | 0/2 | Not started | - |

---

*Roadmap created: 2026-04-07*
*Last updated: 2026-04-07*
