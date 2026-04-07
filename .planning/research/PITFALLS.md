# Domain Pitfalls

**Domain:** PostgreSQL-mediated IPC between a Telegram bot process and a scraper process in Docker Compose
**Researched:** 2026-04-07
**Codebase:** TypeScript/Node.js, InversifyJS, Kysely + pg pool (max: 10), Telegraf 4.16

---

## Critical Pitfalls

Mistakes that cause rewrites, data corruption, or permanent broken state.

---

### Pitfall 1: PROCESSING jobs stranded on crash

**What goes wrong:** Every queue in the codebase (`videoJobs`, `channelJobs`, `videoDiscoveryJobs`, `channelDiscoveryJobs`) transitions a job to `PROCESSING` inside a `FOR UPDATE SKIP LOCKED` transaction before returning it to the worker. If the scraper process crashes — or is SIGKILL'd — between that transition and `markAsSuccess`/`markAsFailed`, the job stays `PROCESSING` forever. The next run skips it because the queue query filters for `status = 'PENDING'`. There is currently no recovery path.

**Why it happens:** The scraper process holds application-level knowledge of which jobs it is currently working on, but that knowledge dies with the process. PostgreSQL `FOR UPDATE SKIP LOCKED` is designed for multi-worker concurrency, not crash recovery — it does not automatically expire locks on process death.

**Consequences:**
- Jobs accumulate in `PROCESSING` after every unclean shutdown.
- After repeated crashes, the queue drains down to zero visible items even though work remains.
- The `videoJobs` table already uses `random()` ordering, so the stuck jobs are not obviously at the front; they become invisible.

**Prevention:**
1. Add a `processingStartedAt TIMESTAMPTZ` column to every job table (or use the existing `statusUpdatedAt` which is already set on every transition).
2. On scraper startup, run a recovery query that resets any jobs stuck in `PROCESSING` for longer than `N` minutes back to `PENDING`. A safe threshold for the video worker is `>= 2× the yt-dlp timeout` (currently no hard timeout on yt-dlp, but the orchestrator's per-scraper `timeoutMs` is 5 min for most, 60 min for video). Use 90 minutes for video jobs, 10 minutes for the rest.
3. Make this recovery a startup step in the scraper's entrypoint, before the first worker runs.

**Detection:** Query `SELECT status, COUNT(*) FROM "videoJobs" GROUP BY status` and watch for `PROCESSING` count growing monotonically across restarts.

---

### Pitfall 2: `scraperStatus` stale state — bot sees phantom RUNNING

**What goes wrong:** The planned `scraperStatus` table will hold the scraper's self-reported state (`RUNNING`, `STOPPED`, `CRASHED`). If the scraper crashes without reaching the code that writes `STOPPED`, the bot reads `RUNNING` indefinitely. `/stop` will write the `STOP` command but nothing is there to consume it. `/start` will refuse to act because it believes the scraper is already running.

**Why it happens:** There is no heartbeat mechanism. The bot has no way to distinguish a live scraper from a dead one using a snapshot of state.

**Consequences:**
- The operator can't start the scraper via Telegram after a crash. They must connect to the container and manually patch the DB row or restart the Docker container.
- If `/start` is made idempotent by checking `scraperStatus`, double-clicking it during a live run is safe, but after a crash it becomes a permanent block.

**Prevention:**
1. Add a `heartbeatAt TIMESTAMPTZ` column to `scraperStatus`. The scraper updates it on every worker loop iteration (or on a separate `setInterval` — every 30 seconds is sufficient since the video worker can sleep 5 seconds between items).
2. The bot treats status `RUNNING` as truly running only if `heartbeatAt > NOW() - INTERVAL '2 minutes'`. If the heartbeat is stale, the bot treats it as `CRASHED` and allows `/start`.
3. Alternatively: use the `scraperStatus` as advisory only, and always allow `/start` to write a `START` command. The scraper, on startup, claims status `RUNNING` unconditionally. This avoids the problem at the cost of making `/start` idempotent by design.

**Detection:** `heartbeatAt` being stale while `status = 'RUNNING'` is the signal. Log a warning in the bot when it detects this condition and sends the user a different message: "Scraper appears to have crashed. Issuing restart."

---

### Pitfall 3: Race condition — two `/start` commands arrive in quick succession

**What goes wrong:** User sends `/start` twice before the scraper has acknowledged startup. Without a lock, the bot writes two `START` commands. The scraper reads one, transitions to `RUNNING`, and the second command is now stale noise. Worse: if command processing is not idempotent, the scraper could attempt to start twice, triggering the existing in-memory `ScraperAlreadyRunningError` guard — but that guard lives in-process and disappears if the process is being freshly started.

**Why it happens:** Telegram delivers each command as an independent message. The bot handles them concurrently (Telegraf processes updates in parallel by default). There is no distributed lock.

**Consequences:**
- Benign in the happy path: second command is ignored. Confusing in edge cases: user gets two acknowledgement messages.
- More dangerous: if the bot writes a `STOP` between two `START` commands (e.g., `START` at t=0, `STOP` at t=1, `START` at t=2), the scraper may see only the most recent command, which is correct — but only if the bot uses upsert semantics (single row with `updatedAt`) rather than a command queue (append-only). A command queue requires explicit deduplication.

**Prevention:**
1. Model `scraperControl` as a **single-row upsert**, not an append-only queue. The table has exactly one row: `{ command: 'START'|'STOP'|'KILL', issuedAt: TIMESTAMPTZ }`. The scraper polls and acts on the most recent command. Duplicate `/start` writes are harmless — they just overwrite the same row.
2. Make the bot's `/start` handler check `scraperStatus` first and reply "Already running" without writing a command if the scraper is live. This is the UX layer; the DB layer stays idempotent regardless.
3. Telegraf's `bot.command()` handlers are called concurrently for simultaneous updates. Add an application-level mutex (a simple `Map<userId, Promise>`) in the controller if strict serialization is needed. For a single-admin bot this is unlikely to matter.

---

### Pitfall 4: `pg.Pool` connection exhaustion when DB is unavailable

**What goes wrong:** The `pg.Pool` is configured with `max: 10`. Both the bot and the scraper share the same pool configuration but will have separate pool instances (since they are separate processes). If PostgreSQL is unavailable, every query attempt blocks waiting for a connection that never resolves. The pool's default `connectionTimeoutMillis` is 0 (wait forever). Both processes will accumulate pending async operations until they exhaust memory or the OS kills them.

**Why it happens:** Kysely's `tryCatch` wrapper catches thrown errors from Kysely queries, but if the pool is waiting (not throwing), the promise never rejects. The `pg` client has no default query timeout.

**Consequences:**
- Scraper polling loop stalls silently. No Telegram notification because the notifier also uses fetch to the Telegram HTTP API, which works independently — but any status write via DB also stalls.
- Bot becomes unresponsive to commands if its DB queries stall (e.g., `/stats` reads from DB).
- Docker health checks, if they query the DB, will also fail.

**Prevention:**
1. Set `connectionTimeoutMillis: 5000` and `idleTimeoutMillis: 30000` on the `pg.Pool`. This causes the pool to throw rather than block indefinitely.
2. Set `statement_timeout` at the PostgreSQL session level (can be done in the connection string or via a pool `connect` event): `SET statement_timeout = '30s'`.
3. In the scraper polling loop, wrap every DB call in a timeout guard: if the DB is unreachable for `N` consecutive retries with exponential backoff (2s, 4s, 8s, cap at 60s), log the failure and continue the loop without crashing. Do not write `CRASHED` status if the reason is DB unavailability — the bot won't be able to read it either.
4. The scraper's startup dependency (`depends_on: db`) in Docker Compose only waits for the container to start, not for PostgreSQL to accept connections. Use a `healthcheck` on the `db` service and `depends_on: db: condition: service_healthy` to block the scraper from starting until Postgres is ready.

---

## Moderate Pitfalls

---

### Pitfall 5: Docker restart loops — thundering herd on repeated crashes

**What goes wrong:** Docker Compose `restart: always` or `restart: on-failure` will restart a crashed container immediately and indefinitely. If the scraper crashes on startup (e.g., because a required DB migration hasn't run), it enters an infinite restart loop with exponential backoff managed by Docker. The backoff resets after a successful run, so a crash that happens 10 seconds into a run triggers another immediate restart.

**Why it happens:** Docker's restart backoff applies per-session, not per-error-type. A scraper that crashes during a yt-dlp call on video #3 after 60 minutes of healthy operation will restart immediately.

**Consequences:**
- If the crash cause is persistent (bad DB state, missing migration, rate-limit ban), the scraper hammers the external service or the DB repeatedly.
- Log volume explodes, obscuring the real cause.

**Prevention:**
1. Use `restart: on-failure` with `condition: on-failure` (not `always`) for the scraper. The bot can use `always` — it has no external side effects on startup.
2. Set `deploy.restart_policy.max_attempts: 5` and `delay: 10s` in the Compose spec. After 5 failures, Docker stops restarting and alerts you via log.
3. For the scraper specifically: a `restart: on-failure:5` gives 5 attempts. After that, the container stays stopped and the bot's next `/start` command plus manual intervention is the recovery path. This is appropriate — the operator should know the scraper is down.
4. The bot should NOT have `restart: always` either — `on-failure` is safer. But if Telegram long-polling is interrupted, the bot process stays alive; it just won't receive updates. Telegraf handles reconnection internally.

**Docker Compose syntax:**
```yaml
scraper:
  restart: on-failure
  # Compose v3 restart policy:
  deploy:
    restart_policy:
      condition: on-failure
      delay: 10s
      max_attempts: 5
      window: 120s
```

Note: `deploy.restart_policy` is a Docker Swarm key and is ignored by `docker compose up` without Swarm. For plain Compose, `restart: on-failure:5` is the supported form.

---

### Pitfall 6: SIGTERM / stop_grace_period — scraper killed mid-download

**What goes wrong:** Docker sends SIGTERM to the container's PID 1 (the Node.js process), then waits `stop_grace_period` seconds before sending SIGKILL. The current `ScraperOrchestrator.stop()` sets `shouldContinueFlag = false` and awaits `loopPromise`. The loop exits at the next `if (!shouldContinueFlag)` check, which happens at the top of each worker's `while` loop. However, the video worker's inner operation — `processVideoEntry.execute()` → `youtubeApiGetVideo.getVideo()` → `yt-dlp` subprocess — can run for minutes. `shouldContinueFlag` is checked before dequeuing the next item, not inside the yt-dlp call.

The current codebase has `stop_grace_period: ${STOP_GRACE_PERIOD}` in docker-compose.yml, populated via env var. If the env var is not set, Docker defaults to 10 seconds. That is not enough for a yt-dlp download.

**Consequences:**
- The scraper receives SIGTERM, sets `shouldContinueFlag = false`, but the current yt-dlp process runs to completion. If completion takes longer than `stop_grace_period`, Docker sends SIGKILL to the Node process. The yt-dlp child process is orphaned (it runs as a child of the Node process; on SIGKILL, the OS cleans it up, but the video job stays `PROCESSING`).
- The video job is now stranded in `PROCESSING` (see Pitfall 1).

**Prevention:**
1. Set `stop_grace_period: 180s` (3 minutes) for the scraper container. This gives the current yt-dlp invocation time to finish. Set `stop_grace_period: 10s` for the bot container (Telegraf shuts down quickly).
2. The Node.js SIGTERM handler calls `stopApp.execute()` which calls `scraperOrchestrator.stop()` and then `process.exit(0)`. The `await this.loopPromise` inside `stop()` correctly waits for the current worker iteration to finish. This pattern is sound — the key is giving it enough time via `stop_grace_period`.
3. Ensure Node.js is the PID 1 in the container, not a shell wrapper. Use `CMD ["node", "dist/src/scraper.js"]`, not `CMD ["sh", "-c", "node ..."]`. With a shell as PID 1, SIGTERM is sent to the shell, not Node — the shell may not forward it, leading to SIGKILL after grace period with no cleanup.
4. For the scraper: if yt-dlp is invoked via `ytdlp-nodejs`, on SIGTERM you cannot abort an in-flight yt-dlp execution. The only clean exit is waiting for it to finish. 3 minutes covers the typical yt-dlp metadata-only call. If full video downloads are ever added, this timeout needs revisiting.

---

### Pitfall 7: TypeScript build — accidental cross-process imports

**What goes wrong:** With two entry points (`src/bot.ts` and `src/scraper.ts`), TypeScript's single `tsconfig.json` will compile everything under `src/` into `dist/`. Nothing prevents `bot.ts` from importing `ScraperOrchestrator`, or `scraper.ts` from importing `TelegramBot`. The TypeScript compiler will not error — both files exist in the output. The mistake is silent until runtime when the wrong dependencies are loaded.

In this codebase the risk is concrete: `OnScraperStopUseCase` (used only by the scraper) imports `TelegramNotifier` (needed by both), which is fine. But `LifecycleController` imports `StartScrapersUseCase` and `StopScrapersUseCase`, which import `ScraperOrchestrator`. In the new architecture, `LifecycleController` in the bot process must **not** import `ScraperOrchestrator` — it should use a `ScraperCommandRepository` (writes to DB) instead. The old use case file will still exist in the repo, and a stale import would silently pull the orchestrator into the bot's DI container, loading yt-dlp and 4 workers into the bot process.

**Consequences:**
- Bot process instantiates scraper workers — defeats the purpose of process separation.
- If `YtDlpClient` tries to find the yt-dlp binary on startup (the `ytdlp-nodejs` constructor calls `new YtDlpWrapper()` which may probe the binary), the bot container will fail to start if yt-dlp is not installed there.

**Prevention:**
1. Create separate `tsconfig.bot.json` and `tsconfig.scraper.json` with `"include": ["src/bot.ts"]` / `"src/scraper.ts"]` and their transitive dependencies only. The `build:bot` and `build:scraper` scripts use these configs. TypeScript's project references can enforce the boundary at compile time.
2. Alternatively: keep a single tsconfig (simpler) but add an ESLint rule or a custom module boundary check. The lightweight option is a test: after building, run `node -e "require('./dist/src/bot.js')"` (or ES module equivalent) and check which modules are loaded. If `ScraperOrchestrator` appears in the require tree, it is a build failure.
3. Use a barrel file strategy: `src/bot/index.ts` and `src/scraper/index.ts` export only what is valid for each process. Keep the shared kernel (`src/shared/`) separate from both.
4. In InversifyJS, bind containers separately per entry point. The bot container must not call `container.bind(ScraperOrchestrator)`. If it accidentally imports the class, InversifyJS will error at runtime only when `.get()` is called — not at bind time, making it an unreliable guard.

---

### Pitfall 8: PostgreSQL polling interval — too fast vs too slow

**What goes wrong:** The bot polls `scraperStatus` to send follow-up messages after `/start` and `/stop`. The polling interval is a tradeoff:
- Too fast (< 1s): Each command handler opens a new DB query in a loop. If 10 users send `/start` simultaneously (this is a single-admin bot, so unlikely, but still), the connection pool fills with pollers.
- Too slow (> 10s): The follow-up Telegram message ("Scraper is now running") arrives 10 seconds after the scraper is actually up, which feels laggy.

The existing `pg.Pool` has `max: 10` connections. The scraper uses some of these for its worker queries. The bot uses some for status polling and command writes. Under normal load, 10 is fine. The problem arises if polling loops are not properly cleaned up after the awaited state is reached.

**Consequences:**
- Leaked polling intervals hold DB connections open and block the pool.
- If the DB is unavailable (see Pitfall 4), a tight polling loop creates a storm of failed connection attempts.

**Prevention:**
1. Use a polling interval of **2–3 seconds** for follow-up messages. It is fast enough to feel responsive and slow enough to be gentle on the DB.
2. Always cancel the poll when the desired state is reached or when a timeout expires. Use a `clearInterval` in a `finally` block or model it as a `Promise.race([pollForState, timeout(30_000)])`.
3. Give the bot and scraper separate named connection pools (use `application_name` in the Postgres connection string). This makes it easy to see in `pg_stat_activity` which pool is consuming connections.
4. Consider `LISTEN/NOTIFY` as an alternative to polling for the status channel. The scraper writes its status to the DB and calls `pg_notify('scraper_status', 'RUNNING')`. The bot has a persistent connection subscribed via `client.query('LISTEN scraper_status')`. This eliminates polling entirely and gives sub-second notification. The tradeoff: one persistent raw `pg.Client` (not pool-managed) is needed for the LISTEN connection, adding a bit of complexity.

---

## Minor Pitfalls

---

### Pitfall 9: `depends_on` in Docker Compose does not wait for Postgres readiness

**What goes wrong:** `depends_on: db` only waits for the container to start, not for PostgreSQL to be ready to accept connections. The bot and scraper will attempt to connect while Postgres is still initializing (typically 1–3 seconds on first start, or longer after a crash recovery).

**Prevention:** Add a health check to the `db` service and use `condition: service_healthy` in both bot and scraper `depends_on`:
```yaml
db:
  healthcheck:
    test: ["CMD-SHELL", "pg_isready -U $$POSTGRES_USER -d $$POSTGRES_DB"]
    interval: 5s
    timeout: 5s
    retries: 5

bot:
  depends_on:
    db:
      condition: service_healthy

scraper:
  depends_on:
    db:
      condition: service_healthy
```

---

### Pitfall 10: `TelegramNotifier` in the scraper uses raw `fetch` — no retry

**What goes wrong:** `TelegramNotifier` in `src/modules/telegram/telegram-notifier.ts` calls the Telegram Bot API via `fetch` directly. If the Telegram API is temporarily unavailable (rate limit, network blip), `sendMessage` returns a `Failure`. The caller logs the failure and continues. This means crash notifications (`OnScraperStopUseCase`, `ProcessScraperFailureUseCase`) can be silently dropped.

**Prevention:** The scraper process should not depend on Telegram API availability to report its status. The DB-based `scraperStatus` table is the authoritative signal — the bot reads it and notifies. The scraper only needs to write to the DB. Remove the `TelegramNotifier` dependency from scraper-side use cases entirely; replace with a DB status write.

---

### Pitfall 11: `ScraperOrchestrator` stop is fire-and-stop, not confirmed stop

**What goes wrong:** `ScraperOrchestrator.stop()` sets `shouldContinueFlag = false` and `await`s `loopPromise`. When the loop finishes, `this.isRunning = false`. But if `stop()` is called while the orchestrator was never started (`loopPromise === null`), `stop()` returns `Failure({ type: "ScraperNotRunningError" })` immediately. This is correct for the in-process case. In the IPC case, the scraper polls the command table and may read `STOP` before it has fully started its loop — similar window exists.

**Prevention:** In the new IPC model, the scraper should only transition `scraperStatus` to `STOPPED` after the loop has fully exited (which the current `runLoop()` → `isRunning = false` pattern already does correctly). The bot should not rely on the command being acknowledged instantly. A 30-second timeout for "awaiting STOPPED status" is appropriate; if not received, notify the user and suggest `/kill`.

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| DB schema for IPC tables | Forgetting `heartbeatAt` column | Add it in the migration, not as an afterthought |
| Startup recovery query | Running it after workers have started | Recovery must be the first thing in `scraper.ts` before `ScraperOrchestrator.start()` |
| Docker Compose split | Shell as PID 1 absorbs SIGTERM | Use `CMD ["node", ...]` array form in Dockerfile |
| Bot polling loop | Leaked intervals on quick command pairs | Cancel interval in `finally`, add 30s timeout |
| TypeScript two-entry-point build | Bot accidentally imports scraper-only modules | Separate tsconfig or post-build import check |
| `LISTEN/NOTIFY` as polling alternative | Persistent client not returned to pool on disconnect | Use `pg.Client` (not pool), reconnect on error |
| `stop_grace_period` | Default 10s not set, yt-dlp killed mid-run | Set `stop_grace_period: 180s` for scraper in compose file |
| pg.Pool on DB unavailability | Pool hangs forever | Set `connectionTimeoutMillis: 5000` in pool config |

---

## Sources

- Codebase: direct analysis of `src/modules/scraping/scraper.orchestrator.ts`, all four queue files, `src/db/client.ts`, `docker-compose.yml`, `Dockerfile.prod`
- Codebase concern audit: `.planning/codebase/CONCERNS.md` (existing `PROCESSING` leak documented there)
- PostgreSQL `FOR UPDATE SKIP LOCKED` behavior: standard PostgreSQL locking semantics (HIGH confidence — well-documented)
- Docker `stop_grace_period` and SIGTERM forwarding: Docker Compose documentation (HIGH confidence)
- `pg.Pool` defaults (`connectionTimeoutMillis: 0`): node-postgres documentation (HIGH confidence)
- `LISTEN/NOTIFY` pattern: PostgreSQL documentation (HIGH confidence)
- Telegraf concurrent update processing: Telegraf source / documentation (MEDIUM confidence — behavior verified from source review)
