# Codebase Structure

**Analysis Date:** 2026-04-07

## Directory Layout

```
yg/
├── src/
│   ├── main.ts                        # App entry point — IoC container + lifecycle
│   ├── start-app.ts                   # StartAppUseCase
│   ├── stop-app.ts                    # StopAppUseCase
│   ├── types/
│   │   └── index.ts                   # Result, Success, Failure, BaseError types
│   ├── db/
│   │   ├── client.ts                  # Kysely client singleton
│   │   ├── index.ts                   # Re-exports
│   │   ├── types.ts                   # Database interface + all row types
│   │   ├── migrations/                # Timestamped migration files
│   │   ├── repositories/              # Shared cross-module repositories
│   │   │   └── channels.repository.ts
│   │   └── scripts/                   # Migration CLI scripts
│   └── modules/
│       ├── _common/                   # Shared utilities
│       │   ├── errors.ts              # BaseError type
│       │   ├── try-catch.ts           # tryCatch(promise) helper
│       │   ├── http/                  # HTTP client wrapper
│       │   ├── logger/                # Logger class
│       │   └── validation/            # Validation helpers, error types
│       ├── telegram/                  # Core Telegram module
│       │   ├── telegram-bot.ts        # Telegraf bot, auth middleware, controller registration
│       │   ├── telegram-controller.ts # TelegramController interface
│       │   └── telegram-notifier.ts   # Outbound notification sender
│       ├── youtube-api/               # All YouTube data fetching
│       │   ├── extractors/            # HTML/JSON extractors with schemas
│       │   ├── parsers/               # Data parsers (counts, dates, durations)
│       │   ├── yt-api-get-video.ts
│       │   ├── yt-api-get-channel.ts
│       │   ├── yt-api-get-channel-video-entries.ts
│       │   ├── yt-api-search-channels-via-videos.ts
│       │   ├── yt-api-search-channels-direct.ts
│       │   ├── yt-dlp-client.ts       # yt-dlp subprocess wrapper
│       │   └── youtube-api.types.ts   # Shared YT API types
│       ├── i18n/
│       │   └── index.ts               # LanguageCode type + helpers
│       ├── domain/
│       │   └── elastic-captions-sync.ts  # Domain entity
│       ├── captions-search/           # Elasticsearch sync + search
│       │   ├── bootstrap.ts           # Standalone sync bootstrap
│       │   ├── find-captions-bootstrap.ts
│       │   ├── resync-bootstrap.ts
│       │   ├── sync-data-to-elastic.use-case.ts
│       │   ├── find-captions.use-case.ts
│       │   ├── elastic-captions-sync.service.ts
│       │   └── elastic-captions-sync.repository.ts
│       └── scraping/                  # Core scraping domain
│           ├── scraper.orchestrator.ts  # Manages the 4-stage scraper loop
│           ├── constants.ts            # ScraperName, WorkerStopCause enums
│           ├── on-scraper-stop.use-case.ts
│           ├── stats.repository.ts
│           ├── config/
│           │   ├── scraper-config.ts
│           │   └── scraper-config.repository.ts
│           ├── error-handling/
│           │   ├── process-scraper-failure.use-case.ts
│           │   └── process-scraper-failure.use-case.test.ts
│           ├── telegram/              # Telegram controllers for scraping
│           │   ├── lifecycle.controller.ts  # /start /stop /restart commands
│           │   ├── stats.controller.ts      # /stats command
│           │   ├── config.controller.ts     # config commands
│           │   └── use-cases/
│           │       ├── start-scrapers.use-case.ts
│           │       ├── stop-scrapers.use-case.ts
│           │       ├── toggle-scraper.use-case.ts
│           │       └── get-config.use-case.ts
│           └── scrapers/
│               ├── channel-discovery/   # Stage 1: Find channels via search
│               │   ├── bootstrap.ts
│               │   ├── search-channel-queries.worker.ts
│               │   ├── search-channel-queries.queue.ts
│               │   ├── search-channel-queries.seeder.ts
│               │   ├── channel-entry.ts
│               │   ├── channel-entry.repository.ts
│               │   ├── search-channel-query.ts
│               │   └── use-cases/
│               │       └── find-channels.use-case.ts
│               ├── channel/             # Stage 2: Enrich channel data
│               │   ├── bootstrap.ts
│               │   ├── channel-entries.worker.ts
│               │   ├── channel-entries.queue.ts
│               │   ├── channel.ts
│               │   ├── channel.repository.ts
│               │   ├── index.ts
│               │   └── use-cases/
│               │       └── process-channel-entry.use-case.ts
│               ├── video-discovery/     # Stage 3: Find videos per channel
│               │   ├── bootstrap.ts
│               │   ├── channels.worker.ts
│               │   ├── channels.queue.ts
│               │   ├── config.ts
│               │   ├── video-entry.ts
│               │   ├── video-entry.repository.ts
│               │   ├── index.ts
│               │   └── use-cases/
│               │       └── find-channel-videos.use-case.ts
│               └── video/               # Stage 4: Process videos + captions
│                   ├── bootstrap.ts
│                   ├── video-entries.worker.ts
│                   ├── video-entries.queue.ts
│                   ├── transcription-jobs.queue.ts
│                   ├── video.ts
│                   ├── video.repository.ts
│                   ├── caption.ts
│                   ├── channel-videos-health.ts
│                   ├── channel-video-health.repository.ts
│                   ├── config.ts
│                   ├── index.ts
│                   └── use-cases/
│                       ├── process-video-entry/
│                       │   ├── process-video-entry.use-case.ts
│                       │   ├── process-video-entry.use-case.test.ts
│                       │   ├── caption-analysis.service.ts
│                       │   ├── caption-clean-up.service.ts
│                       │   ├── captions-similarity.service.ts
│                       │   ├── auto-captions.validator.ts
│                       │   ├── manual-captions.validator.ts
│                       │   └── video.mapper.ts
│                       └── reprocess-captions/
│                           ├── bootstrap.ts
│                           └── reprocess-captions.use-case.ts
├── db/
│   └── dump/                          # Database dump files
├── dist/                              # TypeScript compiled output (gitignored)
├── logs/                              # Runtime log files (category-named, gitignored)
├── docs/                              # Documentation files
├── _debug/                            # Debug scripts and samples (not production code)
│   ├── captions/
│   ├── html/
│   └── scripts/
├── .planning/                         # GSD planning documents
│   └── codebase/
├── .claude/                           # Claude agent configuration
├── package.json
├── tsconfig.json
├── docker-compose.yml
├── Dockerfile.dev
├── Dockerfile.prod
├── Makefile
└── .env.example
```

## Directory Purposes

**`src/modules/_common/`:**
- Purpose: Shared utilities used across all modules
- Contains: `Logger`, `tryCatch`, HTTP client, validation helpers, `BaseError` type
- Key files: `src/modules/_common/try-catch.ts`, `src/modules/_common/logger/logger.ts`

**`src/modules/scraping/scrapers/`:**
- Purpose: One subdirectory per pipeline stage; each is self-contained with its own worker, queue, repository, use cases, and optional bootstrap
- Contains: `channel-discovery/`, `channel/`, `video-discovery/`, `video/`

**`src/modules/youtube-api/`:**
- Purpose: All logic for fetching and parsing YouTube data; no persistence here
- Contains: Named functions per operation (`yt-api-get-video.ts`, etc.), extractors for parsing HTML/JSON, parsers for primitive values, `yt-dlp-client.ts` for subprocess calls

**`src/db/`:**
- Purpose: Database client, schema types, and migration tooling
- Contains: Single `dbClient` Kysely instance, `Database` interface mapping all tables, timestamped migrations
- Key files: `src/db/client.ts`, `src/db/types.ts`

**`src/modules/captions-search/`:**
- Purpose: Elasticsearch integration — sync PostgreSQL captions to ES and full-text search
- Contains: Standalone bootstrap scripts, sync use case, search use case

**`src/modules/telegram/`:**
- Purpose: Core Telegram bot infrastructure; controllers live in `src/modules/scraping/telegram/`
- Contains: Bot setup, auth middleware, notifier, controller interface

**`_debug/`:**
- Purpose: Ad-hoc debugging scripts and sample HTML/caption files; not imported by production code

## Key File Locations

**Entry Points:**
- `src/main.ts`: Primary app entry — IoC container, lifecycle, signal handlers
- `src/start-app.ts`: `StartAppUseCase` — seeds data, starts bot, optionally starts scrapers
- `src/stop-app.ts`: `StopAppUseCase` — graceful shutdown

**Configuration:**
- `src/db/types.ts`: All database table schemas as TypeScript interfaces
- `src/modules/scraping/constants.ts`: `ScraperName` and `WorkerStopCause` enums
- `src/modules/scraping/scrapers/video/config.ts`: Video scraper constants (max failed streak, algorithm version)
- `docker-compose.yml`: PostgreSQL + Elasticsearch service definitions
- `.env.example`: Required environment variable names

**Core Logic:**
- `src/modules/scraping/scraper.orchestrator.ts`: The main scraper loop
- `src/types/index.ts`: `Result`, `Success`, `Failure` — used everywhere
- `src/modules/_common/try-catch.ts`: `tryCatch` — used in every repository

**Testing:**
- `src/modules/scraping/error-handling/process-scraper-failure.use-case.test.ts`
- `src/modules/scraping/scrapers/video/use-cases/process-video-entry/process-video-entry.use-case.test.ts`
- `src/modules/youtube-api/yt-api-get-video.test.ts`

## Naming Conventions

**Files:**
- Use cases: `<action>-<target>.use-case.ts` (e.g., `process-video-entry.use-case.ts`, `find-channels.use-case.ts`)
- Workers: `<resource>.worker.ts` (e.g., `video-entries.worker.ts`)
- Queues: `<resource>.queue.ts` (e.g., `video-entries.queue.ts`, `search-channel-queries.queue.ts`)
- Repositories: `<resource>.repository.ts` (e.g., `video.repository.ts`, `channel-entry.repository.ts`)
- Domain entities: `<entity>.ts` (e.g., `video.ts`, `caption.ts`, `channel-entry.ts`)
- Services: `<function>.service.ts` (e.g., `caption-analysis.service.ts`)
- Controllers: `<area>.controller.ts` (e.g., `lifecycle.controller.ts`)
- Schemas: `<target>.schemas.ts` alongside extractor files
- Tests: `<target>.test.ts` co-located with the file under test

**Directories:**
- Pipeline stages use noun phrases: `channel-discovery/`, `video-discovery/`
- Use cases group into `use-cases/` subdirectories per stage
- `_common/` prefix for shared cross-cutting utilities (underscore signals non-domain)

**Classes:**
- PascalCase with role suffix: `VideoEntriesWorker`, `VideoRepository`, `ProcessVideoEntryUseCase`, `LifecycleController`

## Where to Add New Code

**New Scraper Stage:**
- Create `src/modules/scraping/scrapers/<stage-name>/` with: `<stage>.worker.ts`, `<stage>.queue.ts`, `<entity>.repository.ts`, `use-cases/<action>.use-case.ts`, `bootstrap.ts`
- Register worker in `src/modules/scraping/scraper.orchestrator.ts` `scrapersConfig`
- Add `ScraperName` constant to `src/modules/scraping/constants.ts`
- Add job table migration to `src/db/migrations/`
- Add row interface to `src/db/types.ts` `Database`

**New Use Case:**
- Place in `src/modules/<module>/use-cases/<action>-<target>.use-case.ts` (or directly in the module if standalone)
- Decorate with `@injectable()`
- Single public `execute()` method returning `Promise<Result<Value, Error>>`

**New Repository:**
- Place in `src/modules/<module>/<entity>.repository.ts` (or `src/db/repositories/` if cross-module)
- Decorate with `@injectable()`
- Import `dbClient` from `src/db/client.ts`
- Wrap all Kysely calls with `tryCatch()` from `src/modules/_common/try-catch.ts`
- Return `Result<T, DatabaseError>`

**New Telegram Command:**
- Add to the appropriate controller in `src/modules/scraping/telegram/`
- Create a use case in `src/modules/scraping/telegram/use-cases/`
- Register the controller in `src/modules/telegram/telegram-bot.ts` `registerControllers()` if adding a new controller

**New Database Table:**
- Create a timestamped migration in `src/db/migrations/` using `npx tsx src/db/scripts/create-migration-file.ts`
- Add the row interface and type aliases to `src/db/types.ts`

**New YouTube API Operation:**
- Add a top-level file `src/modules/youtube-api/yt-api-<operation>.ts`
- Place extractors in `src/modules/youtube-api/extractors/<operation>.extractor.ts` + `<operation>.schemas.ts`
- Place parsers in `src/modules/youtube-api/parsers/<field>.parser.ts`

**Utilities and Helpers:**
- Truly shared helpers: `src/modules/_common/`
- Error types: add to `src/modules/_common/errors.ts` or define inline in the relevant module

## Special Directories

**`dist/`:**
- Purpose: TypeScript compiled output
- Generated: Yes (by `tsc`)
- Committed: No (gitignored)

**`logs/`:**
- Purpose: Runtime log files; one file per logger category (e.g., `logs/worker-video-fetcher`)
- Generated: Yes (at runtime by `Logger`)
- Committed: No (gitignored)

**`_debug/`:**
- Purpose: Developer debugging scripts and sample data files; not used by production code
- Generated: No
- Committed: Yes

**`db/dump/`:**
- Purpose: Database dump snapshots
- Generated: Manually
- Committed: Yes

**`.planning/`:**
- Purpose: GSD planning and codebase analysis documents
- Generated: By Claude agents
- Committed: Yes

---

*Structure analysis: 2026-04-07*
