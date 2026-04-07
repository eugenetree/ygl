# Architecture Patterns: Bot/Scraper Process Split

**Domain:** Two-process Node.js app communicating via PostgreSQL
**Researched:** 2026-04-07
**Overall confidence:** HIGH (based on codebase inspection + verified patterns)

---

## Context

The current codebase runs `TelegramBot` and `ScraperOrchestrator` in the same process (`src/main.ts`).
The coupling is direct: `StopScrapersUseCase` calls `scraperOrchestrator.stop()` in-memory, and `OnScraperStopUseCase` calls `telegramNotifier.sendMessage()` from inside the scraper loop.

The goal is two separate OS processes (separate Docker containers) that communicate only through PostgreSQL.

---

## Question 1: Monorepo vs Two Entry Points in One Repo

### Recommendation: Two entry points, one repo, zero new tooling

This codebase does not need a monorepo tool (Turborepo, Nx, etc.) or `npm workspaces`. Those tools exist for separate npm packages that publish independently. Here you have one application compiled once and started in two ways.

The cleanest pattern for this repo is:

```
src/
  bot/
    main.ts          ← entry point 1: TelegramBot + no ScraperOrchestrator
  scraper/
    main.ts          ← entry point 2: ScraperOrchestrator + no TelegramBot
  modules/           ← all shared business logic stays here, untouched
  db/                ← shared, untouched
```

The single `tsconfig.json` compiles all of `src/` to `dist/` as today. Two compiled outputs land at `dist/src/bot/main.js` and `dist/src/scraper/main.js`. No per-entrypoint `outDir` is needed because both share the same `dist/` tree.

Two Dockerfiles (or one Dockerfile with a build-arg `ENTRYPOINT`) each `node dist/src/bot/main.js` or `node dist/src/scraper/main.js`. Docker Compose adds two service definitions pointing at the same image, differing only in `command:`.

```yaml
# docker-compose.yml
services:
  bot:
    build: .
    command: node dist/src/bot/main.js
    environment: *common-env

  scraper:
    build: .
    command: node dist/src/scraper/main.js
    environment: *common-env
    stop_grace_period: 120s   # scraper needs more time
```

**Why not TypeScript project references?** Project references add `composite: true`, `.tsbuildinfo` files, and per-package `outDir` configs. That overhead is designed for large codebases where you want incremental compilation of independent packages. Here the shared code is not a published package — it is just directories inside `src/`. A single `tsc` invocation compiling all of `src/` is the right fit.

**Confidence: HIGH** — verified against existing `tsconfig.json` (single `outDir: ./dist`, `module: nodenext`) and current `package.json` scripts that already use `node dist/src/...` paths.

---

## Question 2: Shared IoC Container vs Separate Containers

### Recommendation: Separate minimal containers per process

Each entry point creates its own `Container` with only the bindings it needs. Do not create a shared `createSharedContainer()` factory.

**Bot container bindings (bot/main.ts):**
- `Logger`, `HttpClient`
- `TelegramBot`, `TelegramNotifier`
- All telegram controllers (`LifecycleController`, `StatsController`, `ConfigController`)
- `ScraperControlRepository` (new — writes commands, reads status via DB)
- `ScraperConfigRepository`
- `StatsRepository`
- No workers, no `ScraperOrchestrator`

**Scraper container bindings (scraper/main.ts):**
- `Logger`, `HttpClient`, `YtDlpClient`
- All four workers + queues
- `ScraperOrchestrator`
- `ScraperControlRepository` (new — reads commands, writes status via DB)
- `ScraperConfigRepository`
- `TelegramNotifier` (for stop notifications — direct HTTP POST, no bot dependency)
- No `TelegramBot`, no Telegraf instance

**Why not a shared bootstrap function?**
The current `src/modules/scraping/bootstrap.ts` already shows the pattern of per-scraper bootstrap functions. Each process bootstraps only what it needs. A shared factory would bind everything in one call, forcing the bot container to resolve `YtDlpClient` (which shells out to yt-dlp and must be present on the host) even though the bot never uses it. Separate containers keep the dependency graph honest.

InversifyJS `autobind: true` (which this codebase uses) resolves all injectable classes lazily on first `container.get()`, so the only risk with a merged container is accidentally triggering a resolution path you did not intend — this is avoided by keeping containers separate.

**Confidence: HIGH** — based on InversifyJS documentation and direct inspection of how autobind works with the existing container setup.

---

## Question 3: PostgreSQL IPC Schema

### Recommendation: Two tables, separated by concern

The key insight is that `scraperControl` (commands) and `scraperStatus` (actual state) are different things with different owners and different update patterns. Mixing them into one table creates race conditions between the bot writing commands and the scraper updating state.

#### `scraper_commands` table (bot writes, scraper reads and acks)

```sql
CREATE TABLE scraper_commands (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  command     TEXT        NOT NULL,  -- 'START' | 'STOP' | 'KILL'
  issued_by   TEXT        NOT NULL,  -- e.g. 'telegram:user_id'
  issued_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  acked_at    TIMESTAMPTZ,           -- scraper sets this when command is consumed
  status      TEXT        NOT NULL DEFAULT 'PENDING'
              -- 'PENDING' | 'ACKED' | 'SUPERSEDED'
);

-- Only one PENDING command at a time (prevents stacking start/stop/start)
CREATE UNIQUE INDEX scraper_commands_single_pending
  ON scraper_commands (status)
  WHERE status = 'PENDING';
```

The `UNIQUE` partial index on `status = 'PENDING'` is the most important detail. It means the bot's INSERT will fail (or be handled via `ON CONFLICT DO UPDATE`) if a command is already pending — preventing the case where a user spams `/stop` and the scraper sees multiple STOP commands.

#### `scraper_status` table (scraper writes, bot reads)

```sql
CREATE TABLE scraper_status (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  state             TEXT        NOT NULL,
  -- 'IDLE' | 'STARTING' | 'RUNNING' | 'STOPPING' | 'STOPPED' | 'CRASHED'
  active_scrapers   TEXT[]      NOT NULL DEFAULT '{}',
  stop_reason       TEXT,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Singleton row pattern: always exactly one row
-- INSERT on migration, UPDATE-only after that
```

Use a singleton row (insert one row during migration, then always `UPDATE`). Do not insert a new row on every state change — that makes queries for "current state" require a `ORDER BY updated_at DESC LIMIT 1` and accumulates unbounded rows. A single `UPDATE ... RETURNING *` is atomic and gives you current state with one query.

#### How the scraper polls commands safely

The scraper polls `scraper_commands` every 2–3 seconds inside the `executeLoop`, checked at the top of each `while (true)` iteration (where `shouldContinueFlag` is already checked today). The poll uses `FOR UPDATE SKIP LOCKED` to be safe if ever two instances run:

```typescript
// Inside ScraperOrchestrator, at top of each iteration:
const pending = await trx
  .selectFrom('scraperCommands')
  .selectAll()
  .where('status', '=', 'PENDING')
  .forUpdate()
  .skipLocked()
  .executeTakeFirst();

if (pending?.command === 'STOP' || pending?.command === 'KILL') {
  await trx.updateTable('scraperCommands')
    .set({ status: 'ACKED', ackedAt: new Date() })
    .where('id', '=', pending.id)
    .execute();
  this.shouldContinueFlag = false;
}
```

The existing `shouldContinueFlag` mechanism is preserved — the DB poll just becomes the signal source instead of an in-memory method call.

#### On LISTEN/NOTIFY vs polling

LISTEN/NOTIFY would reduce latency from ~2 seconds to near-zero. However, it has a critical production reliability problem: notifications are not persisted. If the scraper's dedicated LISTEN connection drops (e.g., a transient network blip between containers) and reconnects, all notifications sent during the disconnection are silently lost. The command is gone with no trace.

For a control plane (START/STOP/KILL), lost commands are unacceptable. The polling approach with the `scraper_commands` table guarantees command delivery because the row persists until the scraper ACKs it. Use polling.

If sub-second latency for command delivery ever matters, you can add a LISTEN/NOTIFY on top of polling as an optimization (notify wakes up the poll early) while keeping the table as the source of truth.

**Confidence: HIGH** — schema pattern derived from PostgreSQL queue design with `FOR UPDATE SKIP LOCKED` (verified against Crunchy Data documentation), LISTEN/NOTIFY limitations confirmed against official PostgreSQL documentation.

---

## Question 4: Graceful Shutdown in the Scraper Process

### Recommendation: Honor SIGTERM immediately but finish current item, then exit

The scraper's `while(true)` loop already has the right structure: `shouldContinueFlag` is checked at the top of each iteration, before the current item starts. The gap is that `stop()` currently awaits `loopPromise` synchronously, which is fine in one process but must be adapted for Docker.

**Pattern:**

```typescript
// scraper/main.ts
const shutdown = async (signal: string) => {
  logger.info(`${signal} received. Requesting graceful stop.`);

  // 1. Write STOPPING state to DB so bot knows shutdown is in progress
  await scraperStatusRepository.setState('STOPPING');

  // 2. Flip the flag — the loop will finish the current item and exit naturally
  scraperOrchestrator.requestStop();

  // 3. Await loop completion with a hard timeout
  const HARD_TIMEOUT_MS = 5 * 60 * 1000; // 5 min — longer than any single video job
  const result = await Promise.race([
    scraperOrchestrator.waitForStop(),
    new Promise<'timeout'>((resolve) => setTimeout(() => resolve('timeout'), HARD_TIMEOUT_MS)),
  ]);

  if (result === 'timeout') {
    logger.error('Graceful shutdown timed out. Forcing exit.');
    await scraperStatusRepository.setState('CRASHED');
  } else {
    await scraperStatusRepository.setState('STOPPED');
  }

  // 4. Close DB pool
  await dbClient.destroy();

  process.exit(0);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));
```

**Docker configuration required:**

```yaml
# docker-compose.yml
scraper:
  stop_grace_period: 360s   # 6 minutes: 5 min hard timeout + 1 min buffer
```

Docker's default stop grace period is 10 seconds. A video scraping job can take significantly longer. The `stop_grace_period` must be set explicitly, or Docker will send SIGKILL before the current job finishes, leaving a `PROCESSING` job in the queue that will never be completed.

**PID 1 issue:** The `Dockerfile.prod` currently uses `CMD ["sleep", "infinity"]`. The real `CMD` must be `CMD ["node", "dist/src/scraper/main.js"]` — not `CMD ["npm", "run", "start"]`. When Node.js runs as PID 1 directly (not via npm or sh), it receives SIGTERM directly. If `sh -c "node ..."` wraps it, the shell becomes PID 1 and may not forward signals.

Alternatively, use `ENTRYPOINT ["/sbin/tini", "--"]` with `CMD ["node", "..."]` and install `tini` in the Dockerfile. Tini forwards all signals to the child process and reaps zombies.

**Confidence: HIGH** — pattern matches existing `ScraperOrchestrator.stop()` design, Docker signal forwarding verified against Node Best Practices guide.

---

## Question 5: Bot Notification Flow After Command

### Recommendation: Fire-and-forget poll loop after command insert

When the bot's `LifecycleController` receives `/stop`, the current in-process flow is:

1. `ctx.reply("Stopping...")` (immediate)
2. `await scraperOrchestrator.stop()` (blocks until loop finishes)
3. `ctx.reply("Scrapers stopped.")` (after stop)

After the split, step 2 becomes a DB write + wait loop. The Telegraf handler must not block its own long-poll loop, so the wait must be fire-and-forget from the handler's perspective.

**Pattern:**

```typescript
// In LifecycleController
bot.command('stop', async (ctx) => {
  // 1. Write command to DB
  const result = await this.scraperControlRepository.issueCommand('STOP');
  if (!result.ok) {
    await ctx.reply('Failed to issue stop command. Check logs.');
    return;
  }

  // 2. Immediate acknowledgement to user
  await ctx.reply('Stop command sent. Waiting for scraper to finish current item...');

  // 3. Detach: do not await this
  this.watchForStateChange({
    targetStates: ['STOPPED', 'CRASHED', 'IDLE'],
    timeoutMs: 6 * 60 * 1000,
    onResolved: (state) => this.telegramNotifier.sendMessage(`Scraper stopped. State: ${state}`),
    onTimeout: () => this.telegramNotifier.sendMessage('Scraper stop timed out. Check logs.'),
  });
});
```

```typescript
private watchForStateChange({
  targetStates,
  timeoutMs,
  onResolved,
  onTimeout,
}: WatchOptions): void {
  const POLL_INTERVAL_MS = 3000;
  const deadline = Date.now() + timeoutMs;

  const poll = async () => {
    if (Date.now() > deadline) {
      onTimeout();
      return;
    }

    const status = await this.scraperStatusRepository.getCurrent();
    if (status.ok && targetStates.includes(status.value.state)) {
      onResolved(status.value.state);
      return;
    }

    setTimeout(poll, POLL_INTERVAL_MS);
  };

  // Start polling without awaiting
  setTimeout(poll, POLL_INTERVAL_MS);
}
```

**Key design decisions:**

- `setTimeout(poll, ...)` instead of `setInterval` avoids overlapping polls if a DB query is slow.
- The poll reads `scraper_status.state` — a single-row `SELECT` that is always fast.
- `watchForStateChange` is self-contained and does not hold any other resource. If the bot restarts while watching, the watch is lost, but the user will eventually query `/stats` to check state.
- The poll interval (3 seconds) is intentionally longer than the command poll interval inside the scraper (2–3 seconds) to ensure the scraper processes the command and updates state before the bot checks.

**On using LISTEN/NOTIFY for the bot poll:** This is a better candidate for LISTEN/NOTIFY than the command delivery case, because the bot is a persistent process and the notification channel is `scraper_status_changed`. If the bot misses a notification (due to reconnect), it falls back to the next poll cycle at worst. However, the polling approach described above is sufficient and avoids the reconnection complexity. Add LISTEN/NOTIFY as a future optimization if poll latency becomes a concern.

**Confidence: HIGH** — pattern directly maps to the existing `TelegramNotifier.sendMessage()` and the Telegraf long-poll architecture already in place.

---

## Component Boundaries After Split

```
┌─────────────────────────────────────┐
│  BOT PROCESS (bot/main.ts)          │
│                                     │
│  TelegramBot (Telegraf long poll)   │
│  LifecycleController                │
│    ├── ScraperControlRepository     │  writes scraper_commands
│    └── watchForStateChange()        │  polls scraper_status
│  StatsController                    │
│    └── StatsRepository              │  reads job tables (unchanged)
│  ConfigController                   │
│    └── ScraperConfigRepository      │  reads/writes scraperConfig (unchanged)
│  TelegramNotifier                   │  direct HTTP POST to Telegram API
└────────────────┬────────────────────┘
                 │ PostgreSQL (shared DB)
┌────────────────┴────────────────────┐
│  SCRAPER PROCESS (scraper/main.ts)  │
│                                     │
│  ScraperOrchestrator (while loop)   │
│    ├── polls scraper_commands       │  reads + ACKs
│    ├── writes scraper_status        │  STARTING / RUNNING / STOPPING / STOPPED
│    └── 4 Workers                   │
│         ├── SearchChannelQueriesWorker
│         ├── ChannelEntriesWorker   │
│         ├── ChannelsWorker         │
│         └── VideoEntriesWorker     │
│  TelegramNotifier                   │  direct HTTP POST (crash/stop notifications)
└─────────────────────────────────────┘
```

The `ScraperOrchestrator` should write to `scraper_status` at these transitions:
- `start()` called → `STARTING`
- First iteration begins → `RUNNING`
- `shouldContinueFlag` set false → `STOPPING`
- `runLoop()` completes normally → `STOPPED`
- `runLoop()` catches error → `CRASHED`

The `StatsController` in the bot currently calls `scraperOrchestrator.getIsRunning()` directly. After the split this reads from `scraper_status.state` instead.

---

## Migration Path (Minimal Disruption)

The existing `ScraperOrchestrator.stop()` and `start()` already work via flag + promise. The split does not require rewriting the orchestrator's internal logic — only the mechanism by which the signal arrives (DB poll instead of in-process method call).

1. Add migration: `scraper_commands` + `scraper_status` tables.
2. Create `ScraperControlRepository` with `issueCommand()` and `getStatus()` methods using Kysely (same pattern as `ScraperConfigRepository`).
3. Create `ScraperStatusRepository` with `setState()` and `getCurrent()`.
4. Modify `ScraperOrchestrator.executeLoop()` to poll `scraper_commands` at the top of each iteration.
5. Modify `ScraperOrchestrator` to write state transitions to `scraper_status`.
6. Create `src/scraper/main.ts` with a container that excludes `TelegramBot`.
7. Create `src/bot/main.ts` with a container that excludes `ScraperOrchestrator` and workers.
8. Update `LifecycleController` to use `ScraperControlRepository` + `watchForStateChange`.
9. Update `StatsController` to read `scraper_status` instead of calling `getIsRunning()`.
10. Update `docker-compose.yml` with two services, set `stop_grace_period: 360s` on scraper.

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Sharing the Container Between Files
**What goes wrong:** A `createContainer()` function imported by both entry points that binds all services.
**Why bad:** Forces both processes to resolve every binding. The bot would need `YtDlpClient` (binary dependency). The scraper would need Telegraf to initialize. Any binding failure crashes both.
**Instead:** Each `main.ts` creates its own `new Container()` with only the bindings it needs.

### Anti-Pattern 2: Using LISTEN/NOTIFY for Command Delivery
**What goes wrong:** Bot sends NOTIFY on a channel, scraper listens. If the scraper's dedicated connection drops during a long video job, the notification is silently lost. The scraper never stops.
**Why bad:** NOTIFY does not persist. This is documented PostgreSQL behavior.
**Instead:** Write commands to `scraper_commands` table. Commands persist until ACKed.

### Anti-Pattern 3: Using `npm start` as CMD in Dockerfile
**What goes wrong:** `CMD ["npm", "run", "scraper"]` → npm spawns Node.js as a child process. npm (not Node.js) is PID 1. When Docker sends SIGTERM, npm receives it and may not forward to the Node.js child, or may exit immediately.
**Why bad:** The scraper's graceful shutdown handler never runs. SIGKILL arrives 10 seconds later mid-job.
**Instead:** `CMD ["node", "dist/src/scraper/main.js"]` directly, or use `tini` as PID 1.

### Anti-Pattern 4: Polling `scraper_commands` Inside the Worker, Not the Orchestrator
**What goes wrong:** Each worker polls the DB independently for a stop signal.
**Why bad:** The stop signal arrives to whoever polls next, not necessarily in a controlled way. The orchestrator loses visibility into the stop sequence.
**Instead:** The orchestrator checks the command table at the top of its outer `for (const scraper of scrapers)` loop — the same place `shouldContinueFlag` is checked today.

### Anti-Pattern 5: Using `setInterval` for the Bot's Watch Loop
**What goes wrong:** If a DB query takes longer than the interval, multiple overlapping polls run concurrently.
**Why bad:** Creates multiple pending promises reading the same row, potential log spam, wasted connections.
**Instead:** Use `setTimeout` (schedule next poll only after current one completes).

---

## Sources

- PostgreSQL NOTIFY semantics and limitations: https://www.postgresql.org/docs/current/sql-notify.html
- PostgreSQL message queuing with FOR UPDATE SKIP LOCKED: https://www.crunchydata.com/blog/message-queuing-using-native-postgresql
- LISTEN/NOTIFY production reliability issues (node-postgres issues): https://github.com/brianc/node-postgres/issues/967
- The Notifier pattern (single connection per process): https://brandur.org/notifier
- Node.js graceful shutdown best practices (Docker, PID 1): https://github.com/goldbergyoni/nodebestpractices/blob/master/sections/docker/graceful-shutdown.md
- State machines in PostgreSQL: https://blog.lawrencejones.dev/state-machines/
- TypeScript single-repo multiple entry point pattern: https://nx.dev/blog/typescript-project-references (for what NOT to use)
