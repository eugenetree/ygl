# Technology Stack: Process Separation (Bot + Scraper)

**Project:** youglish / saythis — split single process into bot + scraper containers
**Researched:** 2026-04-07
**Overall confidence:** HIGH (all recommendations grounded in official docs or the existing codebase)

---

## Context: What We Are Splitting

Current state: one Docker container (`saythis-app`) runs `src/main.ts`, which boots
both `TelegramBot` and `ScraperOrchestrator` in the same process.

Target state: two independent containers — `bot` and `scraper` — sharing the existing
PostgreSQL database as the only communication channel. No new infrastructure.

The existing `scraperConfig` table already holds `enabled` flags per scraper name.
The split extends this to a full command/status pattern.

---

## Decision 1: TypeScript Build — Two Entry Points in One Repo

### Recommended approach: two named tsconfig files that extend the root

The existing `tsconfig.json` compiles `src/` to `dist/` using `"module": "nodenext"`.
The project already has separate bootstrap files per scraper (e.g. `src/modules/scrapers/bootstrap.ts`).
Add two thin tsconfigs that extend the root and override only `outDir` and `include`:

```
tsconfig.json          ← base (existing, keep as-is, used by editors and tsc directly)
tsconfig.bot.json      ← extends root, include: src/bot-entry.ts + shared
tsconfig.scraper.json  ← extends root, include: src/scraper-entry.ts + shared
```

`tsconfig.bot.json` example:
```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "outDir": "./dist"
  },
  "include": ["src"]
}
```

Because both services share the same `src/` tree and the same `dist/` output folder,
**a single `tsc` pass (or `npx tsc`) already produces all needed output.** The per-service
tsconfigs are only needed if you want incremental / project-references builds later;
for this repo they are optional right now.

**Practical recommendation:** Do not introduce TypeScript project references (the
`composite` + `declaration` + `references` system) at this stage. That system is
designed for large monorepos with many independent packages. Here you have a single
shared `src/` tree. The correct approach is:

1. Add `src/main-bot.ts` — entry point that wires InversifyJS for the bot only.
2. Add `src/main-scraper.ts` — entry point that wires InversifyJS for the scraper only.
3. Keep the existing `tsconfig.json`. `tsc` compiles everything to `dist/`.
4. Each Dockerfile container runs its own compiled entry point:
   - bot: `node dist/src/main-bot.js`
   - scraper: `node dist/src/main-scraper.js`

**Why not separate tsconfigs per service?** The codebase uses `"module": "nodenext"` and
`experimentalDecorators: true` with InversifyJS. These settings must be identical in both
services because they share the DI-decorated class files. A single compile pass with the
existing root tsconfig is simpler, faster, and eliminates drift between configs.

**Confidence: HIGH** — verified against existing tsconfig structure.

---

## Decision 2: Docker Compose — Two Independent Containers, One Image

### Recommended approach: one Dockerfile.prod, two services with `command` override

Docker Compose allows two services to reference the same build context and override the
startup command per service. This avoids duplicating Dockerfiles and keeps the image
build cache shared.

```yaml
services:
  bot:
    container_name: saythis-bot
    build:
      context: .
      dockerfile: ${DOCKERFILE:-Dockerfile.prod}
    command: ["node", "dist/src/main-bot.js"]
    restart: unless-stopped
    depends_on:
      db:
        condition: service_healthy
    environment:
      POSTGRES_USER: ${POSTGRES_USER:-admin}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-admin}
      POSTGRES_DB: ${POSTGRES_DB:-saythis}
      DB_HOST: ${DB_HOST:-db}
      DB_PORT: ${DB_PORT:-5432}
      TELEGRAM_BOT_TOKEN: ${TELEGRAM_BOT_TOKEN}
      TELEGRAM_CHAT_ID: ${TELEGRAM_CHAT_ID}

  scraper:
    container_name: saythis-scraper
    build:
      context: .
      dockerfile: ${DOCKERFILE:-Dockerfile.prod}
    command: ["node", "dist/src/main-scraper.js"]
    restart: unless-stopped
    depends_on:
      db:
        condition: service_healthy
    environment:
      POSTGRES_USER: ${POSTGRES_USER:-admin}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-admin}
      POSTGRES_DB: ${POSTGRES_DB:-saythis}
      DB_HOST: ${DB_HOST:-db}
      DB_PORT: ${DB_PORT:-5432}
```

**Key points:**
- `command` in Compose overrides the Dockerfile `CMD`. The image is built once.
- `restart: unless-stopped` — the right policy for long-running services. Restarts on
  crash. Respects `docker compose stop` (does not auto-restart after daemon restart when
  manually stopped). Better than `always` for maintenance scenarios.
- `depends_on` with `condition: service_healthy` requires a `healthcheck:` block on the
  `db` service. Add it:

```yaml
  db:
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER:-admin} -d ${POSTGRES_DB:-saythis}"]
      interval: 5s
      timeout: 5s
      retries: 5
```

- Dev workflow: `Dockerfile.dev` keeps `CMD ["sleep", "infinity"]`; the Makefile or
  `docker compose run` commands invoke the desired entry point explicitly.

**Why not separate Dockerfiles?** Both services need `yt-dlp`, the same npm dependencies,
and the same compiled TypeScript output. A shared image is strictly better here.

**Confidence: HIGH** — verified against Docker Compose official docs and existing repo
structure.

---

## Decision 3: PostgreSQL as IPC — Command/Status Table Design

### Recommended approach: a single `scraper_control` table (desired + actual state)

This is the Kubernetes reconciliation loop pattern applied at small scale: the bot writes
"desired state"; the scraper polls, reads desired state, updates actual state.

#### Table schema (Kysely/migration)

```sql
CREATE TABLE scraper_control (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Desired state written by the bot
  desired_status  TEXT NOT NULL DEFAULT 'stopped',
                  -- values: 'running' | 'stopped'
  desired_scrapers TEXT[] NOT NULL DEFAULT '{}',
                  -- subset of ScraperName values to run
  -- Actual state written by the scraper process
  actual_status   TEXT NOT NULL DEFAULT 'stopped',
                  -- values: 'stopped' | 'starting' | 'running' | 'stopping' | 'error'
  error_message   TEXT,
  -- Metadata
  updated_by_bot_at    TIMESTAMPTZ,
  updated_by_scraper_at TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed a single row on first migration
INSERT INTO scraper_control (id, desired_status, actual_status)
VALUES ('00000000-0000-0000-0000-000000000001', 'stopped', 'stopped')
ON CONFLICT DO NOTHING;
```

#### Why a single row, not an event log

An event/command log requires the scraper to track "last processed command ID" and handle
deduplication. A single-row desired/actual state is simpler: the scraper always reads the
current desired state, not a queue of past commands. This matches the existing
`scraperConfig` table pattern already in the codebase.

#### Bot side (write desired state)

```typescript
// In lifecycle.controller.ts or a new ScraperControlRepository
await dbClient
  .updateTable('scraperControl')
  .set({
    desiredStatus: 'running',
    desiredScrapers: ['CHANNEL_DISCOVERY', 'VIDEO'],
    updatedByBotAt: new Date(),
  })
  .where('id', '=', CONTROL_ROW_ID)
  .execute();
```

#### Scraper side (polling loop)

```typescript
// Poll interval: 5 seconds is appropriate for a start/stop command
// Use timers/promises setInterval — no external dependency needed
import { setInterval as setIntervalAsync } from 'node:timers/promises';

async function controlLoop(signal: AbortSignal) {
  for await (const _ of setIntervalAsync(5000, undefined, { signal })) {
    const row = await controlRepo.findControl();
    if (row.desiredStatus === 'running' && row.actualStatus === 'stopped') {
      await controlRepo.setActualStatus('starting');
      await scraperOrchestrator.start(row.desiredScrapers);
    }
    if (row.desiredStatus === 'stopped' && row.actualStatus === 'running') {
      await controlRepo.setActualStatus('stopping');
      await scraperOrchestrator.stop();
    }
  }
}
```

#### Why polling over LISTEN/NOTIFY

`pg` client LISTEN/NOTIFY is push-based and avoids polling overhead, but:
1. It requires a **dedicated long-lived `pg.Client`** (not a pool connection) that must be
   manually reconnected on drop. The existing stack uses `pg.Pool` via Kysely; adding a
   raw Client introduces a different connection management path.
2. `pg-listen` (the only mature library abstracting reconnect) has not been updated since
   December 2020 and is effectively unmaintained.
3. The command frequency is very low (human-driven start/stop). Polling a single row every
   5 seconds costs effectively nothing.

Polling is the right call here. LISTEN/NOTIFY would be appropriate if the scraper needed
sub-second reaction time or if many events were generated programmatically.

**Confidence: HIGH** — grounded in codebase analysis and pg documentation.

---

## Decision 4: Polling Interval Implementation

### Recommended approach: `node:timers/promises` with AbortSignal — zero new dependencies

Node.js 22 ships `timers/promises` with `setInterval` that accepts an `AbortSignal`.
This is idiomatic, zero-dependency, and integrates cleanly with graceful shutdown.

```typescript
import { setInterval as asyncSetInterval } from 'node:timers/promises';

class ScraperControlPoller {
  private abortController: AbortController | null = null;

  async start(): Promise<void> {
    this.abortController = new AbortController();
    const { signal } = this.abortController;

    try {
      for await (const _ of asyncSetInterval(5000, undefined, { signal })) {
        await this.tick();
      }
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ABORT_ERR') return; // clean shutdown
      throw err;
    }
  }

  async stop(): Promise<void> {
    this.abortController?.abort();
  }

  private async tick(): Promise<void> {
    // read desired state, reconcile with actual state
  }
}
```

**Do not use:** `setInterval()` (callback-style, harder to await cleanup), `node-cron`
(overkill for a loop), `async-polling` (2017, no types), `poll` npm package (adds a dep
for 10 lines of code).

**Confidence: HIGH** — Node.js 22 docs confirm `timers/promises` API.

---

## Decision 5: Graceful Shutdown

### Recommended approach: AbortController + existing SIGTERM/SIGINT pattern

The codebase already has the correct pattern in `src/main.ts`:

```typescript
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
```

Extend this for the scraper process:

```typescript
const shutdown = async (signal: string) => {
  logger.info(`${signal} received. Graceful shutdown starting...`);

  // 1. Stop accepting new control commands (abort the polling loop)
  controlPoller.stop();

  // 2. Signal the scraper to stop after current item
  await scraperOrchestrator.stop();  // already drains current worker

  // 3. Close DB pool
  await dbClient.destroy();

  // 4. Force-exit after timeout (Docker sends SIGKILL after stop_grace_period)
  process.exit(0);
};
```

Match `stop_grace_period` in `docker-compose.yml` to the scraper's worst-case item
duration. The `VIDEO` scraper has a `timeoutMs: HOUR_MS` session — this is the timeout
for a full session, not a single item. Set `stop_grace_period: 5m` as a reasonable bound
for the bot and `stop_grace_period: 10m` for the scraper to allow current video to
finish.

**Do not install** `http-graceful-shutdown` (HTTP-specific), `node-graceful-shutdown`
(adds dependency for what is 20 lines of existing code).

**Confidence: HIGH** — pattern already exists in codebase.

---

## Recommended Stack Summary

| Concern | Solution | New dependency? |
|---------|----------|-----------------|
| Two entry points | `src/main-bot.ts` + `src/main-scraper.ts`, single `tsc` pass | No |
| Two Docker containers | One `Dockerfile.prod`, two services with `command:` override in Compose | No |
| Restart policy | `restart: unless-stopped` per service | No |
| DB health gate | `depends_on: condition: service_healthy` + `healthcheck` on `db` | No |
| IPC mechanism | Single-row `scraper_control` table, bot writes desired state, scraper polls | No |
| Polling implementation | `node:timers/promises` `setInterval` with `AbortSignal` | No |
| Graceful shutdown | Extend existing SIGTERM handler with AbortController | No |
| Kysely type registration | Add `scraperControl: ScraperControlRow` to `Database` interface | No |

Zero new npm dependencies are required for this migration. All tooling already exists
in Node.js 22 and the current stack.

---

## What NOT to Use

| Option | Why not |
|--------|---------|
| TypeScript project references (`composite: true`) | Designed for multi-package monorepos; overkill for a shared `src/` tree |
| `pg-listen` (LISTEN/NOTIFY library) | Unmaintained since 2020 |
| Raw `pg.Client` LISTEN/NOTIFY | Requires manual reconnect logic; polling is cheaper at this command frequency |
| Separate Dockerfiles | No benefit; both services share all dependencies and compiled output |
| `restart: always` | Does not respect `docker compose stop`; makes maintenance harder |
| `restart: on-failure` | Does not restart after daemon restart; wrong for long-running services |
| `node-graceful-shutdown` npm package | Adds a dependency for logic already present in the codebase |
| Event/command log table | Over-engineered for human-frequency commands; desired/actual state is sufficient |

---

## Sources

- TypeScript project references: https://www.typescriptlang.org/docs/handbook/project-references.html
- Docker Compose `command` override: https://docs.docker.com/reference/compose-file/services/
- Docker restart policies: https://docs.docker.com/engine/containers/start-containers-automatically/
- Node.js `timers/promises`: https://nodejs.org/api/timers.html
- pg LISTEN/NOTIFY with Node.js: https://node-postgres.com/apis/client
- pg-listen maintenance status: https://github.com/andywer/pg-listen (last release Dec 2020)
- PostgreSQL LISTEN/NOTIFY limitations: https://neon.com/guides/pub-sub-listen-notify
