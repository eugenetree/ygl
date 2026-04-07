# Feature Landscape: Bot↔Scraper Control Interface

**Domain:** Telegram bot controlling a separate scraper worker process
**Researched:** 2026-04-07
**Confidence:** HIGH (codebase read directly; conventions from Docker, Kubernetes, Unix signal semantics — well-established)

---

## Current State (from codebase)

The existing single-process design already answers several questions correctly. Before recommending changes, here is what already works well and should be preserved:

- `/stop` sends an immediate "Stopping scrapers. Waiting for current item to finish." then awaits completion — this is the right pattern.
- `/start` is fire-and-forget at the orchestrator level (sets a flag, starts the loop promise, returns immediately) — also correct.
- Error notifications are pushed via `TelegramNotifier` when a scraper session fails.
- `ScraperOrchestrator.getIsRunning()` exposes a live boolean that `/stats` uses.
- The stop reason enum (`GRACEFUL`, `ERROR`, `QUEUE_EXHAUSTED`) is solid and should survive the split.

The split introduces one fundamental change: the bot and the scraper no longer share in-process state, so `getIsRunning()` and direct `await orchestrator.stop()` stop working. Everything below addresses that gap.

---

## Table Stakes

Features that must exist for the split to be functional. Missing any of these makes the control interface broken.

| Feature | Why Required | Complexity | Notes |
|---------|-------------|------------|-------|
| Immediate acknowledgment on every command | Telegram blocks delivery of next update from same chat until your handler returns. Long synchronous waits degrade UX. | Low | Reply "Stop requested, waiting for current item..." before awaiting completion. Current `/stop` already does this. |
| Status state visible to bot without in-process reference | Bot cannot call `getIsRunning()` across a process boundary. | Medium | State must live in shared DB row, Redis key, or be sent via a message channel. DB is already present and the natural fit. |
| Confirmation that command was received by scraper | Fire-and-forget to a command channel means the bot cannot tell if the scraper is running and saw the message. | Medium | Scraper must acknowledge the command, or bot must poll status after sending. |
| Stop-reason propagation after scraper halts | `OnScraperStopUseCase` sends a Telegram message on stop. This must still work after the split — the scraper process needs to send the notification itself, or write the reason to DB for the bot to read. | Medium | Current `TelegramNotifier` (raw HTTP POST) can live in the scraper process; no Telegraf instance needed. |
| `/kill` command | Documented in scraper.md as a required command. Not yet implemented. Semantics: immediate termination, no waiting for current item. | Medium | See Kill vs Stop section below. |
| Idempotent command responses | "Scrapers are already running" / "Scrapers are not running" guards already exist in the codebase and must be preserved in the cross-process design. | Low | State must be authoritative; race window between check and act must be handled. |

---

## Command Semantics

### /start

**Recommended: fire-and-forget with immediate confirmation.**

"Scrapers started." is the correct reply, sent as soon as the start signal is dispatched to the scraper. The bot does not wait for the scraper loop to enter its first iteration.

Rationale: The scraper has no meaningful "fully started" moment — the loop begins immediately after `isRunning = true`. There is nothing to wait for. Waiting would block Telegram update delivery for the chat.

Pattern used in production bots: reply immediately, then let the scraper push an async notification if something goes wrong at startup (e.g. DB error during seeder). This is exactly how the current codebase works: `start()` is synchronous in its error-check but non-blocking for the actual loop.

**Edge cases to guard:**
- Scraper already running: reply "Scrapers are already running." — current behavior, keep it.
- Scraper process is down (bot cannot reach it): reply "Scraper is unreachable." — new case introduced by the split.

### /stop

**Recommended: immediate acknowledgment, then await confirmation from scraper.**

The current pattern — "Stopping scrapers. Waiting for current item to finish." sent immediately, then a second reply "Scrapers stopped." when the loop exits — is the right UX for a graceful stop that can take up to the session timeout (up to 1 hour for VIDEO scraper). Do not change this.

After the split, "awaiting completion" means the bot polls the shared state (e.g. a DB status row) or subscribes to a notification from the scraper. The scraper must write `STOPPED` to shared state and/or invoke `TelegramNotifier` when done, exactly as `OnScraperStopUseCase` does today.

**Edge cases to guard:**
- Scraper not running: "Scrapers are not running." — current behavior, keep it.
- Stop signal sent but scraper process crashes before confirming: bot must time out after a reasonable period (e.g. the max session timeout + buffer) and notify "Scraper may have crashed, no stop confirmation received."

### /kill

**Not yet implemented. Recommended semantics: SIGTERM escalating to SIGKILL equivalent.**

Industry convention (from Docker, Kubernetes, Unix): `stop` = SIGTERM (graceful, wait for current work), `kill` = SIGKILL (immediate, no cleanup).

In this codebase: `/stop` sets `shouldContinueFlag = false` and waits for the loop to reach the next `shouldContinue()` check. `/kill` should immediately reject any in-progress worker run — the equivalent of throwing an abort signal into the running worker or sending a forceful process signal.

Practical implementation options:
1. The scraper listens for a `kill` command on its IPC channel and calls `process.exit()` immediately.
2. The bot sends SIGKILL to the scraper process (only viable if bot and scraper run on the same host).

Option 1 is safer and works across hosts. The reply to the user should be fire-and-forget: "Kill signal sent." without waiting for confirmation, because a killed process may not send one.

**When to use `/kill` vs `/stop`:** `/kill` is for when the scraper appears stuck or is consuming resources unexpectedly and graceful stop is not responding. This is an emergency command.

### /restart

**Current behavior is correct: stop then start, with intermediate status messages.**

After the split, the bot must wait for the scraper to confirm stop before sending start, otherwise the "already running" guard will fire. The current `await stopScrapersUseCase.execute()` pattern handles this — the split must preserve that the start command is only sent after stop is confirmed.

### /stats

**Recommendation: pull from shared DB directly in the bot process.**

The current `StatsRepository` queries DB tables that are visible to both processes. The bot can continue to own this query entirely — no IPC needed for stats.

The `stateLabel` (running/stopped) currently comes from `scraperOrchestrator.getIsRunning()`. After the split this must come from the shared state row instead.

---

## Status Reporting: Recommended State Machine

The states you listed (IDLE, STARTING, RUNNING, STOPPING, STOPPED, ERROR) are appropriate. Recommended additions based on the current codebase's stop reasons:

```
IDLE          → no session has ever run, or state was explicitly reset
STARTING      → start command received, scraper not yet confirmed running
RUNNING       → scraper confirmed loop is active
STOPPING      → stop/kill command received, loop not yet confirmed stopped
STOPPED       → loop exited with GRACEFUL stop reason
QUEUE_EXHAUSTED → loop exited because a scraper's queue was empty (maps to auto-stop)
ERROR         → loop exited with ERROR stop reason
UNREACHABLE   → heartbeat has not been received within the dead threshold
```

These map directly to the existing `StopReason` union type. `UNREACHABLE` is new — introduced by the process boundary.

**Granularity recommendation:** Per-orchestrator (single row), not per-scraper. The four scrapers (CHANNEL_DISCOVERY, CHANNEL, VIDEO_DISCOVERY, VIDEO) run in a loop managed by the orchestrator. The bot does not need per-scraper state — that is an internal concern. Active scraper name can optionally be included in the status row for `/stats` display, but is not required for command routing.

**Where to store state:** A single `scraper_status` row in the existing PostgreSQL DB. The scraper writes it; the bot reads it. This avoids adding a new dependency (Redis, message queue) and the DB is already shared infrastructure. The Wikipedia "Database-as-IPC" anti-pattern warning applies to high-frequency messaging, not to a low-frequency (commands arrive rarely) status row.

---

## Heartbeat / Health Check

**Problem being solved:** After the split, the scraper can silently crash (OOM, unhandled exception in the main event loop, Docker container restart). The bot would continue reporting "RUNNING" because the state row was last written as `RUNNING` and nobody updated it.

**Recommended pattern:** Scraper writes a `last_heartbeat_at` timestamp to the status row on every loop iteration (approximately every few minutes, since each scraper session runs for up to 5-60 minutes). The bot marks state as `UNREACHABLE` when computing `/stats` or responding to commands if `now - last_heartbeat_at > threshold`.

**Threshold recommendation:** 2-3x the maximum heartbeat interval. If the VIDEO scraper session runs up to 1 hour, the heartbeat interval is naturally "at least once per hour on normal operation." A threshold of 90-120 minutes before declaring UNREACHABLE is appropriate. For tighter detection, the scraper could write a heartbeat on each `shouldContinue()` check (called per item, so much more frequent).

**What the bot should do on UNREACHABLE:**
- `/stats`: report "State: UNREACHABLE (last seen: X minutes ago)"
- `/start`: attempt to send start command anyway; log that state was UNREACHABLE
- `/stop`: reply "Scraper may be unreachable; stop signal sent anyway."
- Proactive notification: after N missed heartbeat windows (e.g. 2), push a Telegram message "Scraper appears to have crashed, last seen X minutes ago." This mirrors how `OnScraperStopUseCase` works today but for crash detection.

**Do not over-engineer:** A `last_heartbeat_at` column on a status row is sufficient. There is no need for a dedicated supervisor process, a separate heartbeat endpoint, or TCP keepalives for this use case. The bot already polls or responds to commands; checking the timestamp at that point is zero overhead.

---

## /kill vs /stop Semantics

Industry convention (confirmed across Docker, Kubernetes, Unix signals, and the existing scraper.md spec):

| Command | Signal equivalent | Behavior | Use when |
|---------|-----------------|----------|----------|
| `/stop` | SIGTERM | Set graceful-stop flag; wait for current item to finish | Normal shutdown; data integrity matters |
| `/kill` | SIGKILL | Immediate termination; no cleanup | Scraper stuck; emergency; graceful stop unresponsive |

This maps cleanly to the existing codebase: `/stop` sets `shouldContinueFlag = false` and awaits `loopPromise`. `/kill` would skip the wait — either via `process.exit()` in the scraper or by never resolving the await in the bot side and letting the status row show STOPPED when the process dies.

**Bot reply behavior:**
- `/stop`: Acknowledge immediately ("Stopping..."), then send a second message when confirmed stopped.
- `/kill`: Acknowledge immediately ("Kill signal sent."), do not wait for confirmation (a killed process may not reply).

---

## Edge Cases

These are the failure modes that most commonly trip up bot↔worker control systems. All are concrete risks given this codebase's design.

### 1. Command arrives but worker is already in the target state

**Current handling:** "ScraperAlreadyRunningError" and "ScraperNotRunningError" are already returned and handled. This must be preserved in the split.

**Risk after split:** The state check is now a DB read, not an in-process boolean. There is a race window: bot reads `RUNNING`, user sends `/start`, bot reads `RUNNING` again and replies "already running" — correct. But if bot reads `RUNNING`, scraper crashes (sets `ERROR` or stops updating heartbeat) before the bot sends the command, the bot sends `/start` into a dead scraper. The scraper's IPC listener must handle a start command when the process is already starting up from a previous crash.

### 2. Duplicate commands from the same user (fast double-tap)

**Not currently guarded.** If a user sends `/stop` twice quickly, the second command arrives while the first `await loopPromise` is still pending. In the current single-process design, the second call to `stop()` would return `ScraperNotRunningError` because `isRunning` was already set to false by the first call's flag. This is correct behavior.

After the split, the bot must guard this at the command handler level: if a stop/kill is already in-flight (i.e. status is `STOPPING`), reply "Already stopping." and do not send a second command.

### 3. Stop command delivered but scraper process crashes during stop

**Scenario:** `/stop` is sent, `shouldContinueFlag = false`, but the scraper crashes before reaching the next `shouldContinue()` check (e.g. a network error inside the worker throws uncaught, `loopPromise` rejects).

**Current handling:** The outer `try/catch` in `runLoop()` catches the crash, sets `isRunning = false`, and calls `onScraperStopUseCase` with `{ type: "ERROR" }`. The Telegram notification is sent.

**After split:** Same behavior can be preserved — the scraper writes `ERROR` to the status row and calls `TelegramNotifier`. The bot-side `/stop` command handler that is awaiting confirmation must handle a timeout: if confirmation does not arrive within (session timeout + 5 minutes), send "Stop timed out; scraper may have crashed."

### 4. Bot restarts while scraper is running

**Scenario:** Bot process is redeployed. Scraper keeps running. Bot loses in-memory knowledge that scraper is running.

**Current design is vulnerable to this.** The `isRunning` boolean is in-process memory; a bot restart resets it to `false`. After split, with state in DB, this is automatically resolved: the bot reads `RUNNING` from the status row on startup.

**Action required by the split:** The scraper must persist state to DB (not just hold it in memory), so the bot can recover it after restart.

### 5. Scraper starts on deploy while bot is also auto-starting it

**Documented in scraper.md as a known confusion.** If the commented-out auto-start block in `start-app.ts` is re-enabled in either process, both could try to start the scraper simultaneously.

**Recommendation:** Auto-start should be in exactly one place, and the "already running" guard is the safety net. Since the split separates the processes, the simplest rule is: the scraper process owns its own auto-start on deploy; the bot never auto-starts on its own deploy. The bot's `/start` command remains user-driven only.

### 6. /stats reports stale state when scraper is mid-transition

**Scenario:** User sends `/stats` while scraper is transitioning from STOPPING to STOPPED. The DB row may show `STOPPING` with a job still in progress. This is correct — the state is accurate.

**Non-issue if state is updated atomically.** Write `STOPPING` when stop is requested, write `STOPPED` + stop reason when confirmed. The bot's `/stats` reads whatever is current.

### 7. Command sent to an unreachable scraper with no error surfaced

**Most dangerous edge case.** Bot sends start command to scraper IPC channel. Scraper process is down. Channel has no consumer. Command is silently dropped. Bot replies "Scrapers started." but nothing happened.

**Mitigation:** After sending the start command, the bot should poll the status row for a transition from STARTING to RUNNING within a short window (e.g. 10 seconds). If the row stays STARTING after that window, send a follow-up: "Scraper did not confirm start. It may be offline."

---

## Anti-Features

Features to explicitly NOT build in the first version of the split.

| Anti-Feature | Why Avoid | What to Do Instead |
|-------------|-----------|-------------------|
| Per-scraper status rows (CHANNEL_DISCOVERY_STATUS, etc.) | Over-engineered for a single-operator tool. The orchestrator is the unit of control. | Single orchestrator status row. Active scraper name is optional metadata. |
| WebSocket or SSE push from scraper to bot | Adds infrastructure complexity. Not needed for this use case frequency. | DB status row + TelegramNotifier HTTP push from scraper. |
| Command queue with delivery guarantees (Redis, RabbitMQ) | Overkill. Commands are infrequent, human-initiated, and idempotency guards already handle duplicates. | Write command intent to DB or use a simple HTTP endpoint on the scraper. |
| Retry logic for failed commands | The human operator is in the loop. If a command fails, they will see the error and retry manually. | Clear error messages; no silent retries. |
| Authentication / authorization on commands | Single-user bot, already gated by Telegram chat ID. | No change needed. |
| "Pause" state | Not in the spec. Stop + start is sufficient. | N/A |

---

## Feature Dependencies

```
Shared status row (DB)
  → /stats reads state across process boundary
  → heartbeat dead-detection reads last_heartbeat_at
  → /stop confirmation polling
  → bot restart recovery

IPC channel (command delivery)
  → /start, /stop, /kill reach the scraper process
  → /restart (stop then start via IPC)

Scraper writes state to DB
  → all bot reads are consistent

TelegramNotifier stays in scraper process
  → stop-reason notifications on GRACEFUL / ERROR / QUEUE_EXHAUSTED
  → heartbeat alarm on silent crash
```

---

## MVP Recommendation for the Split

Prioritize in this order:

1. **Shared status row** — `scraper_status` table with `state`, `stop_reason`, `last_heartbeat_at`, `updated_at`. This unblocks all bot reads.
2. **IPC command channel** — simplest viable option: HTTP server in the scraper process, or polling a `scraper_commands` DB table. DB polling removes the need for an open port and works across Docker containers without network config.
3. **Scraper writes state on every transition** — STARTING, RUNNING, STOPPING, STOPPED, ERROR, QUEUE_EXHAUSTED.
4. **Heartbeat writes** — `last_heartbeat_at` updated each loop cycle.
5. **Bot reads status row instead of in-process boolean** — minimal change to `StatsController` and `LifecycleController`.
6. **`/kill` implementation** — new command, straightforward once IPC exists.
7. **UNREACHABLE detection** — threshold check on `last_heartbeat_at` in bot command handlers and `/stats`.

Defer:
- Proactive "scraper appears crashed" Telegram notification — implement after basic heartbeat works, not before.
- Start confirmation polling (checking STARTING → RUNNING) — implement after status row is stable.
