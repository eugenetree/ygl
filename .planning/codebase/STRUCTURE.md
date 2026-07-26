# Codebase Structure

**Analysis Date:** 2026-07-26

## Directory Layout

```
ygl/
├── src/                                    # Application source code
│   ├── main-api.ts                         # API server entry point
│   ├── main-bot.ts                         # Telegram bot entry point
│   ├── main-scraper.ts                     # Scraper process entry point
│   ├── main-elastic.ts                     # Elasticsearch sync entry point
│   ├── start-app.ts                        # Utility: start scraper
│   ├── stop-app.ts                         # Utility: stop scraper
│   │
│   ├── db/                                 # Database layer
│   │   ├── client.ts                       # Kysely ORM client (singleton)
│   │   ├── index.ts                        # Database exports
│   │   ├── types.ts                        # TypeScript types for DB records
│   │   ├── scripts/
│   │   │   ├── run-migrations.ts           # Apply pending migrations
│   │   │   ├── rollback-migration.ts       # Undo last migration
│   │   │   ├── create-migration-file.ts    # Generate new migration
│   │   │   ├── seed-dev.ts                 # Development data seeder
│   │   │   └── seed-dev.test.ts            # Test for seeder
│   │   └── migrations/                     # TypeORM/Kysely migration files (1746*.ts)
│   │
│   ├── types/
│   │   └── index.ts                        # Shared types: Result<T, E>, Success, Failure
│   │
│   ├── modules/                            # Feature-based modules
│   │   │
│   │   ├── _common/                        # Cross-cutting infrastructure
│   │   │   ├── errors.ts                   # BaseError type definition
│   │   │   ├── try-catch.ts                # Promise error wrapper
│   │   │   ├── logger/
│   │   │   │   ├── logger.ts               # Custom logging service
│   │   │   │   └── logger.test.ts
│   │   │   ├── http/
│   │   │   │   ├── index.ts                # Axios HTTP client setup
│   │   │   │   └── errors.ts               # HTTP error types
│   │   │   ├── validation/
│   │   │   │   ├── validator.ts            # Validation orchestrator
│   │   │   │   ├── types.ts                # Validation result types
│   │   │   │   ├── errors.ts               # Validation error types
│   │   │   │   └── helpers.ts              # Utility functions
│   │   │
│   │   ├── api/                            # REST API module
│   │   │   └── api-server.ts               # HTTP server (GET /api/search)
│   │   │
│   │   ├── youtube-api/                    # YouTube data extraction layer
│   │   │   ├── index.ts                    # Module exports
│   │   │   ├── youtube-api.types.ts        # DTO types for API responses
│   │   │   ├── youtube-api.schemas.ts      # Zod/Valibot schemas
│   │   │   ├── youtube-api-client.ts       # Base client wrapper
│   │   │   ├── yt-dlp-client.ts            # yt-dlp CLI wrapper
│   │   │   ├── yt-api-get-video.ts         # Fetch video metadata & captions
│   │   │   ├── yt-api-get-channel.ts       # Fetch channel info
│   │   │   ├── yt-api-get-channel-video-entries.ts # List channel videos
│   │   │   ├── yt-api-search-channels-direct.ts    # YouTube search API
│   │   │   ├── yt-api-search-channels-via-videos.ts # Alt search method
│   │   │   ├── extractors/
│   │   │   │   ├── json-from-html.extractor.ts     # Parse JSON embedded in HTML
│   │   │   │   ├── captions.extractor.ts           # Extract caption structure
│   │   │   │   ├── channel-info.extractor.ts       # Extract channel metadata
│   │   │   │   ├── channel-video.extractor.ts      # Extract single video
│   │   │   │   ├── channel-videos.extractor.ts     # Extract video list
│   │   │   │   ├── search-channels-direct.extractor.ts
│   │   │   │   └── search-channels-via-videos.extractor.ts
│   │   │   └── parsers/
│   │   │       ├── abbreviated-number.parser.ts    # Parse "1.2K" → 1200
│   │   │       ├── channel-created-date.parser.ts
│   │   │       ├── username.parser.ts
│   │   │       ├── video-count.parser.ts
│   │   │       ├── video-duration.parser.ts
│   │   │       └── view-count.parser.ts
│   │   │
│   │   ├── scraping/                       # Core scraping orchestration
│   │   │   ├── constants.ts                # ScraperName enum, WorkerStopCause
│   │   │   ├── scraper.orchestrator.ts     # Manages worker pipeline lifecycle
│   │   │   ├── config/
│   │   │   │   ├── scraper-config.ts       # ScraperConfig entity
│   │   │   │   ├── scraper-config.repository.ts
│   │   │   │   ├── get-config.use-case.ts
│   │   │   │   └── toggle-scraper.use-case.ts
│   │   │   ├── lifecycle/
│   │   │   │   ├── scraper-status.service.ts        # Query/update status in DB
│   │   │   │   ├── scraper-heartbeat.ts             # Periodic DB update
│   │   │   │   ├── scraper-command.listener.ts      # Listen for start/stop commands
│   │   │   │   ├── start-scraper.use-case.ts
│   │   │   │   ├── stop-scraper.use-case.ts
│   │   │   │   ├── request-scraper-start.use-case.ts
│   │   │   │   ├── request-scraper-stop.use-case.ts
│   │   │   │   └── handle-scraper-stop.use-case.ts
│   │   │   ├── error-handling/
│   │   │   │   ├── process-scraper-failure.use-case.ts
│   │   │   │   └── process-scraper-failure.use-case.test.ts
│   │   │   ├── channel-priority/
│   │   │   │   ├── channel-priority.calculator.ts   # Score channels
│   │   │   │   ├── channel-priority.calculator.test.ts
│   │   │   │   ├── channel-priority.constants.ts
│   │   │   │   ├── channel-priority.service.ts
│   │   │   │   ├── channel-priority.scheduler.ts    # Run recalc periodically
│   │   │   │   └── recalculate-all-priorities.use-case.ts
│   │   │   ├── push-channel/
│   │   │   │   ├── boosted-channels.repository.ts
│   │   │   │   ├── push-channel.use-case.ts         # Raise channel priority
│   │   │   │   └── push-channel.use-case.test.ts
│   │   │   ├── logs/
│   │   │   │   └── export-logs.use-case.ts          # Zip and send logs
│   │   │   ├── stats/
│   │   │   │   ├── stats.repository.ts              # Query scraper statistics
│   │   │   │   └── get-stats.use-case.ts
│   │   │   │
│   │   │   └── scrapers/                   # Worker implementations
│   │   │       ├── channel-discovery/      # Phase 1: Search for channels
│   │   │       │   ├── index.ts
│   │   │       │   ├── search-channel-queries.worker.ts
│   │   │       │   ├── search-channel-queries.queue.ts
│   │   │       │   ├── search-channel-query.ts
│   │   │       │   ├── channel-entry.ts
│   │   │       │   ├── channel-entry.repository.ts
│   │   │       │   ├── search-channel-queries.seeder.ts
│   │   │       │   ├── use-cases/
│   │   │       │   │   └── find-channels.use-case.ts
│   │   │       │   └── data/
│   │   │       │       └── search-queries.json
│   │   │       │
│   │   │       ├── channel/                 # Phase 2: Fetch channel metadata
│   │   │       │   ├── index.ts
│   │   │       │   ├── channel-entries.worker.ts
│   │   │       │   ├── channel-entries.queue.ts
│   │   │       │   ├── channel.ts
│   │   │       │   ├── channel.repository.ts
│   │   │       │   └── use-cases/
│   │   │       │       └── process-channel-entry.use-case.ts
│   │   │       │
│   │   │       ├── video-discovery/        # Phase 3: List videos in channel
│   │   │       │   ├── index.ts
│   │   │       │   ├── channels.worker.ts
│   │   │       │   ├── channels.queue.ts
│   │   │       │   ├── config.ts
│   │   │       │   ├── video-entry.ts
│   │   │       │   ├── video-entry.repository.ts
│   │   │       │   └── use-cases/
│   │   │       │       └── find-channel-videos.use-case.ts
│   │   │       │
│   │   │       └── video/                  # Phase 4: Fetch video metadata & captions
│   │   │           ├── index.ts
│   │   │           ├── video-entries.worker.ts
│   │   │           ├── video-entries.queue.ts
│   │   │           ├── video-entries.queue.test.ts
│   │   │           ├── video-entries.worker.test.ts
│   │   │           ├── video.ts
│   │   │           ├── caption.ts
│   │   │           ├── config.ts
│   │   │           ├── video.repository.ts
│   │   │           ├── transcription-jobs.queue.ts
│   │   │           └── use-cases/
│   │   │               ├── get-last-scraped-videos.use-case.ts
│   │   │               ├── process-video-entry/
│   │   │               │   ├── process-video-entry.use-case.ts
│   │   │               │   ├── process-video-entry.use-case.test.ts
│   │   │               │   ├── video.mapper.ts         # DTO → Domain mapping
│   │   │               │   ├── caption-analysis.service.ts
│   │   │               │   ├── caption-analysis.service.test.ts
│   │   │               │   ├── captions-similarity.service.ts
│   │   │               │   ├── captions-similarity.service.test.ts
│   │   │               │   ├── caption-clean-up.service.ts
│   │   │               │   ├── auto-captions.validator.ts
│   │   │               │   └── manual-captions.validator.ts
│   │   │               └── reprocess-captions/
│   │   │                   └── reprocess-captions.use-case.ts
│   │   │
│   │   ├── captions-search/                # Elasticsearch index & search
│   │   │   ├── captions.service.ts         # Search wrapper
│   │   │   ├── elastic-captions-sync.ts    # Main sync logic
│   │   │   ├── elastic-captions-sync.repository.ts
│   │   │   ├── find-captions.use-case.ts
│   │   │   ├── resync-captions.use-case.ts
│   │   │   └── sync-data-to-elastic.use-case.ts
│   │   │
│   │   ├── telegram/                       # Telegram bot commands
│   │   │   ├── telegram-bot.ts             # Bot initialization & routing
│   │   │   ├── telegram-controller.ts      # Controller interface
│   │   │   ├── telegram-notifier.ts        # Send messages to user
│   │   │   ├── scraper-status-watcher.ts   # Monitor state changes
│   │   │   ├── on-scraper-status-change.use-case.ts
│   │   │   ├── config.controller.ts        # /config command
│   │   │   ├── lifecycle.controller.ts     # /start, /stop commands
│   │   │   ├── stats.controller.ts         # /stats command
│   │   │   ├── find.controller.ts          # /find command (caption search)
│   │   │   ├── last-videos.controller.ts   # /last command
│   │   │   ├── export-logs.controller.ts   # /logs command
│   │   │   ├── reprocess-captions.controller.ts
│   │   │   ├── resync-captions.controller.ts
│   │   │   ├── push-channel.controller.ts
│   │   │   └── recalculate-priority.controller.ts
│   │   │
│   │   └── i18n/
│   │       └── index.ts                    # Language code enum
│   │
│   └── fixtures/                           # Test data & seeding
│
├── frontend/                               # Next.js web UI (excluded from build)
│
├── db/                                     # Database artifacts
│   └── dump/                               # SQL backups
│
├── logs/                                   # Runtime logs (generated)
├── dist/                                   # Compiled output (generated)
│
├── docs/                                   # Documentation
│   ├── adr/                                # Architecture Decision Records
│   └── prd/                                # Product Requirements
│
├── scripts/                                # NPM/build scripts
├── .claude/                                # Claude Code agent config
├── .agents/                                # Agent skills
│
├── tsconfig.json                           # TypeScript compiler config
├── biome.json                              # Biome formatter/linter config
├── package.json                            # NPM dependencies & scripts
└── .planning/                              # GSD planning (generated)
```

## Directory Purposes

**`src/`:**
- Purpose: All TypeScript application source code
- Contains: Entry points, modules organized by feature
- Key files: `main-*.ts` (process entry points), `db/client.ts` (ORM singleton)

**`src/db/`:**
- Purpose: Database access layer
- Contains: Kysely client config, migration files, type definitions
- Key files: `client.ts` (singleton instance), `types.ts` (database record types)

**`src/db/scripts/`:**
- Purpose: Database management utilities
- Contains: Migration runner, seeder, rollback
- Key files: `run-migrations.ts`, `seed-dev.ts`

**`src/db/migrations/`:**
- Purpose: TypeORM migration files
- Contains: ~30 numbered migration files (1746*.ts → 1776*.ts)
- Auto-generated by migration CLI; not edited manually

**`src/modules/_common/`:**
- Purpose: Shared infrastructure across all modules
- Contains: Logger, HTTP client, validation, error handling
- Key files: `logger/logger.ts`, `http/index.ts`

**`src/modules/api/`:**
- Purpose: HTTP REST API
- Contains: Single ApiServer class
- Endpoints: `GET /api/search?q=query`

**`src/modules/youtube-api/`:**
- Purpose: YouTube data extraction and parsing
- Contains: yt-dlp wrapper, HTML extractors, number parsers
- Key files: `yt-api-get-video.ts`, `yt-dlp-client.ts`
- Pattern: Extractors parse HTML/JSON; parsers convert strings to numbers/dates

**`src/modules/scraping/`:**
- Purpose: Core scraping orchestration and worker pipeline
- Contains: Orchestrator, lifecycle management, workers
- Key files: `scraper.orchestrator.ts` (main controller)

**`src/modules/scraping/scrapers/`:**
- Purpose: Four-phase scraper workers (discovery → data fetch → processing)
- Contains: Channel discovery → Channel metadata → Video discovery → Video details
- Each subdirectory has: worker, queue, repository, use cases

**`src/modules/scraping/channel-priority/`:**
- Purpose: Rank channels by priority for scraping
- Contains: Calculator (scoring algorithm), scheduler (periodic recalc)
- Key files: `channel-priority.calculator.ts`

**`src/modules/captions-search/`:**
- Purpose: Elasticsearch indexing and caption search
- Contains: Sync use case, repository, Elasticsearch client wrapper
- Key files: `sync-data-to-elastic.use-case.ts`, `find-captions.use-case.ts`

**`src/modules/telegram/`:**
- Purpose: Telegram bot command handlers
- Contains: Bot initialization, controller classes (one per command)
- Key files: `telegram-bot.ts` (setup), `*controller.ts` (command handlers)

**`src/types/`:**
- Purpose: Application-wide type definitions
- Contains: Result type (Success/Failure union)
- Key files: `index.ts`

**`logs/`:**
- Purpose: Runtime log files (generated by Logger)
- Contains: Logs organized by category name (e.g., `logs/scraper-video-fetcher`)
- Generated at runtime; never committed

**`dist/`:**
- Purpose: Compiled TypeScript output (generated)
- Contains: JavaScript files mirroring `src/` structure
- Generated by `npm run build` (tsc); excluded from git

**`db/dump/`:**
- Purpose: Database backups
- Contains: SQL dump files
- Manual backups; not auto-generated

## Key File Locations

**Entry Points:**
- `src/main-api.ts` - REST API server (3001)
- `src/main-scraper.ts` - Scraping process
- `src/main-bot.ts` - Telegram bot
- `src/main-elastic.ts` - Elasticsearch sync

**Configuration:**
- `tsconfig.json` - TypeScript compiler settings (ES2022, strict mode, decorators enabled)
- `biome.json` - Code formatter & linter rules
- `package.json` - Dependencies, npm scripts

**Core Logic:**
- `src/modules/scraping/scraper.orchestrator.ts` - Scraper pipeline controller
- `src/db/client.ts` - Kysely ORM singleton
- `src/modules/youtube-api/yt-api-get-video.ts` - Video metadata fetcher
- `src/modules/telegram/telegram-bot.ts` - Bot initialization

**Testing:**
- `src/**/*.test.ts` - Unit tests (Node test runner via tsx)
- `src/db/scripts/seed-dev.test.ts` - Seeder tests

## Naming Conventions

**Files:**
- `*.ts` - TypeScript source
- `*.test.ts` - Unit test file (paired with implementation)
- `*.use-case.ts` - Use case class (business logic)
- `*.controller.ts` - Controller class (request handler)
- `*.service.ts` - Service class (domain logic, stateless)
- `*.repository.ts` - Repository class (data access)
- `*.worker.ts` - Worker class (async queue processor)
- `*.queue.ts` - Queue class (job management)
- `*.mapper.ts` - Mapper class (DTO ↔ domain conversion)
- `*.validator.ts` - Validator class (input validation)
- `*.extractor.ts` - Extractor class (parse HTML/JSON)
- `*.parser.ts` - Parser function (string conversion)
- `main-*.ts` - Process entry point

**Directories:**
- `use-cases/` - Use case classes within a module
- `scrapers/` - Worker implementations (discovery, data fetch phases)
- `extractors/` - HTML/JSON parsing utilities
- `parsers/` - String parsing functions
- `migrations/` - Database migration files (numbered 1746*.ts)

**Functions:**
- camelCase for all functions and variables
- PascalCase for classes and types
- UPPER_SNAKE_CASE for constants and enums

**Types/Classes:**
- `*Dto` - Data Transfer Object (API response struct)
- `*Props` - Domain entity properties
- `*Schema` - Zod/Valibot validation schema
- `*Repository` - Data access class
- `*UseCase` - Single business operation
- `*Service` - Domain logic service
- `*Worker` - Queue processor
- `*Queue` - Job queue

## Where to Add New Code

**New Feature (e.g., Video Filtering):**
- Primary code: Create `src/modules/scraping/scrapers/video/use-cases/filter-video/filter-video.use-case.ts`
- Service logic: `src/modules/scraping/scrapers/video/use-cases/filter-video/filter-video.service.ts`
- Tests: `src/modules/scraping/scrapers/video/use-cases/filter-video/filter-video.use-case.test.ts`
- Call from: ProcessVideoEntryUseCase (via use case injection)

**New Worker Phase:**
- Directory: Create `src/modules/scraping/scrapers/new-phase/`
- Files: `new-phase.worker.ts`, `new-phase.queue.ts`, `new-phase.repository.ts`
- Register in: `ScraperOrchestrator.scrapersConfig` (add phase config with order)
- Inject into main-scraper.ts container

**New Telegram Command:**
- Controller: Create `src/modules/telegram/my-command.controller.ts` implementing TelegramController
- Use case: Create `src/modules/scraping/my-operation.use-case.ts` (if domain logic needed)
- Register: Add to TelegramBot.registerControllers() method
- Sync: Call TelegramBot.syncCommands() to update command list

**New API Endpoint:**
- Handler: Add route in `src/modules/api/api-server.ts` (start method, add if/else for pathname)
- Use case: Create use case in appropriate module (e.g., `src/modules/captions-search/...use-case.ts`)
- Inject: Add to ApiServer constructor

**New Database Table:**
- Migration: Create `src/db/migrations/[timestamp]-feature.ts` using `npx tsx src/db/scripts/create-migration-file.ts`
- Types: Add to `src/db/types.ts` as Insertable/Selectable/Updateable types
- Repository: Create `src/modules/feature/my-entity.repository.ts`

**Shared Utility:**
- Module: `src/modules/_common/` (for cross-cutting concern)
- Feature module: Create within that module's utils or service
- Export: Use barrel files (index.ts) for public API

## Special Directories

**`frontend/`:**
- Purpose: Next.js web UI for the application (excluded from build)
- Generated: No
- Committed: Yes (separate codebase)
- Build: Handled by separate process; not compiled by main tsconfig.json

**`logs/`:**
- Purpose: Runtime log files
- Generated: Yes (by Logger service at runtime)
- Committed: No (in .gitignore)
- Structure: One file per category (e.g., `logs/worker-video-fetcher`)

**`dist/`:**
- Purpose: Compiled JavaScript output
- Generated: Yes (by tsc)
- Committed: No (in .gitignore)
- Cleanup: `npm run clean` removes entire directory

**`.claude/`:**
- Purpose: Claude Code agent configuration (skills, hooks, commands)
- Generated: Auto-populated by `/gsd-*` commands
- Committed: Yes (project-specific agent setup)

**`.agents/`:**
- Purpose: Custom agent skills for this project
- Generated: Manual (by developer)
- Committed: Yes

**`.planning/`:**
- Purpose: GSD project state (phases, plans, documents)
- Generated: Yes (by GSD commands)
- Committed: Yes (tracks decision history)
- Key subdirs: `.planning/codebase/` (ARCHITECTURE.md, STRUCTURE.md, etc.)

---

*Structure analysis: 2026-07-26*
