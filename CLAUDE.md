# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

YouTube caption-search system. Scrapes channels/videos with yt-dlp, stores captions in Postgres, syncs to Elasticsearch, serves search via HTTP API to a Next.js frontend, controlled via a Telegram bot. Package name `youglish`; DB/image name `saythis`.

Stack: Node 22 + TypeScript (CJS output, ESM-style `.js` import paths), Inversify DI, Kysely + `pg`, Telegraf, Elasticsearch 8, OpenVPN inside the scraper container, Next.js 15 frontend in [frontend/](frontend/).

## Commands

Make targets are the canonical entry (see [Makefile](Makefile)):

```bash
make up | down | rebuild | rebuild-fresh
make app-connect                          # shell into bot container
make db-connect                           # psql
make db-migrate                           # run migrations in container
make db-create-migration name="..."
make db-reset                             # drop + recreate (run db-migrate after)
make db-export | db-restore file=...
```

npm (inside container or on host):

```bash
npm run lint | lint:fix | format | build
npm run test                              # node --test --import tsx "src/**/*.test.ts"
node --test --import tsx src/path/to/file.test.ts   # single test
```

Frontend: `cd frontend && npm run dev`.

## Architecture

**Four independent Node entry points**, each with its own Inversify container; they communicate only through Postgres:

| Entry | Service | Role |
|---|---|---|
| [main-bot.ts](src/main-bot.ts) | `bot` | Telegram bot + scraper status watcher |
| [main-scraper.ts](src/main-scraper.ts) | `scraper` | Orchestrator (runs in VPN container) |
| [main-api.ts](src/main-api.ts) | `api` | HTTP search on :3001, gated by `IS_API_ENABLED` |
| [main-elastic.ts](src/main-elastic.ts) | `sync-elastic` | Postgres → ES caption sync every 60s |

[src/start-app.ts](src/start-app.ts) is legacy — not wired to a main entry, don't use.

**Scraping pipeline.** [scraper.orchestrator.ts](src/modules/scraping/scraper.orchestrator.ts) runs four workers round-robin: `CHANNEL_DISCOVERY` → `CHANNEL` → `VIDEO_DISCOVERY` → `VIDEO`. Each pulls from a `*Jobs` Postgres queue inside a transaction with row locking. `VideoEntriesQueue.enqueue` snapshots `channelPriorityScores` into `videoJobs.priority` so high-priority channels run first.

**Lifecycle split** ([src/modules/scraping/lifecycle/](src/modules/scraping/lifecycle/)). `Request*` use-cases (called by Telegram/API) only write `requestedStatus` on `scrapingProcess`. A Postgres `NOTIFY` trigger wakes `ScraperCommandListener` inside the scraper process, which runs `Start*`/`Stop*` use-cases that drive the orchestrator and write `actualStatus`. `ScraperHeartbeat` writes `lastHeartbeatAt` every 10s; status returns `PROCESS_DOWN` if stale (>30s). On startup, `actualStatus` is reconciled to `STOPPED`. Keep this split when adding lifecycle commands.

**Search flow.** Scraper writes `captions` rows → `sync-elastic` bulk-indexes new ones using `latestSyncedCaptionId` watermark → `api` serves `GET /api/search?q=` via ES `bool` query (match AND + match_phrase boost) → frontend hits `NEXT_PUBLIC_API_URL` (defaults to `http://localhost:3001`).

## Conventions

- **`Result<T, E>` over exceptions** for expected failures ([src/types/index.ts](src/types/index.ts)). Errors are `{ type: "...", ... }` discriminated objects ([_common/errors.ts](src/modules/_common/errors.ts)). Wrap external promises with `tryCatch()` ([_common/try-catch.ts](src/modules/_common/try-catch.ts)) instead of `try/catch`. Match on `result.error.type` at call sites.
- **Imports use `.js` extension** even for sibling TS files (CJS output but ESM-style paths). Order enforced by `@trivago/prettier-plugin-sort-imports`.
- **Kysely `CamelCasePlugin`** — code is camelCase, SQL is snake_case. Source of truth for tables: `Database` interface in [src/db/types.ts](src/db/types.ts). Migrations in [src/db/migrations/](src/db/migrations/) run automatically on container startup. Inside DI, inject `DatabaseClient` rather than importing the `dbClient` singleton.
- **Logger** ([_common/logger/logger.ts](src/modules/_common/logger/logger.ts)) writes to console and synchronously appends to `logs/`. Each entry binds its own `Logger` via `toDynamicValue`; classes call `logger.setContext(ClassName)` (concatenated with `:`) or `logger.child({ context, category })`.

## Environment

- `.env` required; see [.env.example](.env.example). `.env.gb` / `.env.us` are region overrides.
- `DOCKERFILE=Dockerfile.dev|Dockerfile.prod` selects the shared app image; `scraper` always uses `Dockerfile.scraper`.
- `IS_API_ENABLED` must be set for the `api` container to actually serve.
- VPN config and yt-dlp cookies are base64-encoded into env vars; helpers in [scripts/](scripts/).
- Logs bind-mounted from host `/opt/ygl/logs`.

Active design docs in [docs/](docs/) (`prd-*.md`) — check before changing scraper architecture, lifecycle notifications, or bot stats/control.
