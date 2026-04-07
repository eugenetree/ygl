# Architecture

**Analysis Date:** 2026-04-07

## Pattern Overview

**Overall:** Modular pipeline architecture with IoC container, use-case-driven domain logic, and a sequential scraper orchestration loop.

**Key Characteristics:**
- Dependency injection via InversifyJS with `@injectable()` decorators throughout
- Result type pattern (`Result<Value, Error>`) for all fallible operations — no thrown exceptions in business logic
- Four-stage scraping pipeline: channel discovery → channel enrichment → video discovery → video processing
- Telegram bot as the control plane for starting/stopping scrapers and querying stats
- Database-backed job queues (PostgreSQL) rather than in-memory or external queue systems
- Separate bootstrap scripts per scraper stage for standalone execution

## Layers

**Entry Point / Composition Root:**
- Purpose: Wire the IoC container, bind singletons, start app lifecycle
- Location: `src/main.ts`
- Contains: Container setup, signal handlers, `StartAppUseCase` / `StopAppUseCase` invocation
- Depends on: All modules
- Used by: Nothing (top-level)

**Application Use Cases:**
- Purpose: Orchestrate business operations; single public `execute()` method per class
- Location: `src/modules/*/use-cases/`, `src/modules/scraping/scrapers/*/use-cases/`
- Contains: `ProcessVideoEntryUseCase`, `FindChannelsUseCase`, `FindChannelVideosUseCase`, `ProcessChannelEntryUseCase`, `ReprocessCaptionsUseCase`, `SyncDataToElasticUseCase`
- Depends on: Repositories, YouTube API wrappers, queues, services
- Used by: Workers

**Scraper Orchestration:**
- Purpose: Manage the sequential scraper loop — runs scrapers in order with timeouts, handles stop/start lifecycle
- Location: `src/modules/scraping/scraper.orchestrator.ts`
- Contains: `ScraperOrchestrator` — holds a `while(true)` loop cycling through four workers
- Depends on: Four workers (`SearchChannelQueriesWorker`, `ChannelEntriesWorker`, `ChannelsWorker`, `VideoEntriesWorker`)
- Used by: `StartAppUseCase`, `StopAppUseCase`, Telegram controllers

**Workers:**
- Purpose: Dequeue one item at a time from a job queue and delegate to a use case; report `WorkerStopCause` (EMPTY, STOPPED, DONE)
- Location: `src/modules/scraping/scrapers/*/`
  - `src/modules/scraping/scrapers/channel-discovery/search-channel-queries.worker.ts`
  - `src/modules/scraping/scrapers/channel/channel-entries.worker.ts`
  - `src/modules/scraping/scrapers/video-discovery/channels.worker.ts`
  - `src/modules/scraping/scrapers/video/video-entries.worker.ts`
- Contains: `run({ shouldContinue, onError })` loop
- Depends on: Queue classes, use cases
- Used by: `ScraperOrchestrator`

**Job Queues:**
- Purpose: Database-backed queues using `videoJobs`, `channelJobs`, etc. tables; provide `enqueue`, `getNextEntry`, `markAsSuccess`, `markAsFailed`
- Location: `src/modules/scraping/scrapers/*/`
  - `src/modules/scraping/scrapers/video/video-entries.queue.ts`
  - `src/modules/scraping/scrapers/channel-discovery/search-channel-queries.queue.ts`
  - `src/modules/scraping/scrapers/channel/channel-entries.queue.ts`
  - `src/modules/scraping/scrapers/video-discovery/channels.queue.ts`
  - `src/modules/scraping/scrapers/video/transcription-jobs.queue.ts`
- Contains: Kysely queries with `FOR UPDATE SKIP LOCKED` for concurrency safety
- Depends on: `src/db/client.ts`
- Used by: Workers, use cases

**Repositories:**
- Purpose: Typed database access per entity; wrap Kysely queries and return `Result<T, DatabaseError>`
- Location: `src/modules/scraping/scrapers/*/`, `src/db/repositories/`
  - `src/modules/scraping/scrapers/video/video.repository.ts`
  - `src/modules/scraping/scrapers/channel/channel.repository.ts`
  - `src/modules/scraping/scrapers/video-discovery/video-entry.repository.ts`
  - `src/modules/scraping/scrapers/channel-discovery/channel-entry.repository.ts`
  - `src/modules/scraping/scrapers/video/channel-video-health.repository.ts`
  - `src/modules/scraping/config/scraper-config.repository.ts`
  - `src/modules/scraping/stats.repository.ts`
  - `src/modules/captions-search/elastic-captions-sync.repository.ts`
- Depends on: `src/db/client.ts`, `src/db/types.ts`
- Used by: Use cases

**YouTube API Wrappers:**
- Purpose: Abstract all YouTube data fetching — HTML scraping via HTTP + JSON extraction, and `yt-dlp` subprocess invocation
- Location: `src/modules/youtube-api/`
  - `src/modules/youtube-api/yt-api-get-video.ts`
  - `src/modules/youtube-api/yt-api-get-channel.ts`
  - `src/modules/youtube-api/yt-api-get-channel-video-entries.ts`
  - `src/modules/youtube-api/yt-api-search-channels-via-videos.ts`
  - `src/modules/youtube-api/yt-api-search-channels-direct.ts`
  - `src/modules/youtube-api/yt-dlp-client.ts`
- Contains: Extractors (`src/modules/youtube-api/extractors/`) and parsers (`src/modules/youtube-api/parsers/`)
- Depends on: `HttpClient`, `YtDlpClient`
- Used by: Use cases

**Telegram Module:**
- Purpose: Control plane — bot lifecycle, command routing, notifications
- Location: `src/modules/telegram/`
  - `src/modules/telegram/telegram-bot.ts` — Telegraf instance, auth middleware, controller registration
  - `src/modules/telegram/telegram-notifier.ts` — fire-and-forget message sender
  - `src/modules/telegram/telegram-controller.ts` — interface for controllers
- Controllers live in: `src/modules/scraping/telegram/`
  - `src/modules/scraping/telegram/lifecycle.controller.ts` — `/start`, `/stop`, `/restart`
  - `src/modules/scraping/telegram/stats.controller.ts` — `/stats`
  - `src/modules/scraping/telegram/config.controller.ts` — scraper config commands
- Depends on: `ScraperOrchestrator`, use cases, `StatsRepository`
- Used by: `StartAppUseCase`, `StopAppUseCase`

**Captions Search Module:**
- Purpose: Sync caption data to Elasticsearch and expose full-text search
- Location: `src/modules/captions-search/`
  - `src/modules/captions-search/sync-data-to-elastic.use-case.ts`
  - `src/modules/captions-search/find-captions.use-case.ts`
  - `src/modules/captions-search/elastic-captions-sync.service.ts`
- Depends on: `@elastic/elasticsearch`, `dbClient`
- Used by: Standalone bootstrap scripts (`bootstrap.ts`, `find-captions-bootstrap.ts`, `resync-bootstrap.ts`)

**Common Utilities:**
- Purpose: Shared cross-cutting concerns
- Location: `src/modules/_common/`
  - `src/modules/_common/errors.ts` — `BaseError` type
  - `src/modules/_common/try-catch.ts` — `tryCatch(promise)` wraps any promise in `Result`
  - `src/modules/_common/logger/logger.ts` — file+console logger with child loggers and kebab-case categories
  - `src/modules/_common/http/index.ts` — HTTP client wrapper
  - `src/modules/_common/validation/` — validation helpers and error types

## Data Flow

**Primary Scraping Pipeline:**

1. `StartAppUseCase.execute()` seeds search queries, starts TelegramBot, optionally starts `ScraperOrchestrator`
2. `ScraperOrchestrator.start(scraperNames[])` runs an infinite `while(true)` loop cycling through configured workers in order
3. **Stage 1 — Channel Discovery:** `SearchChannelQueriesWorker` pops a query from `searchChannelQueries` job table → `FindChannelsUseCase` calls `YoutubeApiSearchChannelsViaVideos` → found channel IDs are saved to `channelEntries` and enqueued in `channelJobs`
4. **Stage 2 — Channel Enrichment:** `ChannelEntriesWorker` pops a channel entry from `channelJobs` → `ProcessChannelEntryUseCase` calls `YoutubeApiGetChannel` → channel data saved to `channels` table → channel ID enqueued in `videoDiscoveryJobs`
5. **Stage 3 — Video Discovery:** `ChannelsWorker` pops a channel from `videoDiscoveryJobs` → `FindChannelVideosUseCase` calls `YoutubeApiGetChannelVideoEntries` → each video ID saved to `videoEntries` and enqueued in `videoJobs`
6. **Stage 4 — Video Processing:** `VideoEntriesWorker` pops a video entry from `videoJobs` → `ProcessVideoEntryUseCase` calls `YoutubeApiGetVideo` → video + captions persisted to `videos` and `captions` tables → if caption status is `MANUAL_ONLY`, enqueues to `transcriptionJobs`
7. Each worker returns `WorkerStopCause.EMPTY` when its queue is exhausted, causing the orchestrator to stop the loop

**Elasticsearch Sync (standalone):**

1. `sync-data-to-elastic.use-case.ts` reads captions from PostgreSQL in batches
2. Syncs them into Elasticsearch `captions` index
3. Tracks sync state in `elasticCaptionsSync` table

**State Management:**
- All pipeline state lives in PostgreSQL job tables (`channelDiscoveryJobs`, `channelJobs`, `videoDiscoveryJobs`, `videoJobs`, `transcriptionJobs`)
- Job status transitions: `PENDING` → `PROCESSING` → `SUCCEEDED` / `FAILED`
- Channel health tracked in `channelVideosHealth` to skip channels with too many consecutive failures
- No in-memory state shared between runs — fully resumable

## Key Abstractions

**Result Type:**
- Purpose: Explicit error propagation without exceptions
- Definition: `src/types/index.ts`
- Pattern: `Result<Value, Error> = { ok: true; value: T } | { ok: false; error: E }` — callers check `result.ok` before accessing `.value`
- All use cases, repositories, queues, and API wrappers return `Result`

**BaseError:**
- Purpose: Typed error discrimination
- Definition: `src/modules/_common/errors.ts`
- Pattern: `{ type: string } & Record<string, unknown>` — each error has a string `type` used in `switch` statements

**Worker Interface:**
- Purpose: Uniform contract for all scraper workers
- Pattern: `{ run({ shouldContinue: () => boolean, onError: (error: BaseError) => Promise<void> }): Promise<Result<WorkerStopCause, BaseError>> }`
- Examples: All four worker files under `src/modules/scraping/scrapers/*/`

**TelegramController Interface:**
- Purpose: Pluggable command registration
- Definition: `src/modules/telegram/telegram-controller.ts`
- Pattern: `interface TelegramController { register(bot: Telegraf): void }`
- Implementations: `LifecycleController`, `StatsController`, `ConfigController`

**tryCatch Helper:**
- Purpose: Convert any thrown exception to a `Failure` result
- Definition: `src/modules/_common/try-catch.ts`
- Pattern: `tryCatch(promise)` wraps `await promise` in try/catch, returns `Result<T, Error>`

## Entry Points

**Main App:**
- Location: `src/main.ts`
- Triggers: `npm run main` (transpiles then runs `dist/src/main.js`)
- Responsibilities: Build IoC container, register SIGTERM/SIGINT handlers, call `StartAppUseCase`

**Standalone Scraper Bootstraps:**
- Location: `src/modules/scraping/scrapers/*/bootstrap.ts`, `src/modules/captions-search/bootstrap.ts`
- Triggers: `npm run run:video`, `npm run sync:elastic`, etc.
- Responsibilities: Spin up a minimal IoC container and run a single worker or use case in isolation

**DB Migration Scripts:**
- Location: `src/db/scripts/run-migrations.ts`, `rollback-migration.ts`, `create-migration-file.ts`
- Triggers: `npm run db:migration:run`, etc.
- Responsibilities: Apply or roll back Kysely migrations in `src/db/migrations/`

## Error Handling

**Strategy:** Result-based error propagation — errors bubble up as `Failure` values, not thrown exceptions. Workers call `onError` callback on failure and return `Failure`, causing the orchestrator to stop the loop and notify via Telegram.

**Patterns:**
- Repositories wrap all Kysely calls in `tryCatch()` and return `Failure({ type: "DATABASE", error })` on failure
- Use cases check `result.ok` after every async call and return early with `Failure(result.error)` on the first error
- Workers call `onError(error)` then return `Failure` — the orchestrator's `onError` handler calls `ProcessScraperFailureUseCase` which sends a Telegram notification
- Unhandled orchestrator crashes are caught in `runLoop()` and reported via `OnScraperStopUseCase`
- `TelegramBot` has a `.catch()` handler to log unhandled Telegraf errors

## Cross-Cutting Concerns

**Logging:** Custom `Logger` class at `src/modules/_common/logger/logger.ts`. Writes to both console and a file under `logs/<category>`. Supports child loggers for context propagation. Each class calls `logger.child({ context, category })` or `logger.setContext()` in its constructor.

**Validation:** Valibot and Zod used in `src/modules/_common/validation/` and YouTube API extractors/schemas. Schemas live alongside the extractor files (e.g., `src/modules/youtube-api/extractors/*.schemas.ts`).

**Authentication:** Telegram bot checks `ctx.chat.id` against `TELEGRAM_CHAT_ID` env var in a global middleware. All commands are rejected from unauthorized chats.

---

*Architecture analysis: 2026-04-07*
