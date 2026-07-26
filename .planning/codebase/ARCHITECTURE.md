<!-- refreshed: 2026-07-26 -->
# Architecture

**Analysis Date:** 2026-07-26

## System Overview

```text
┌─────────────────────────────────────────────────────────────────────┐
│                      Entry Points (Process Roles)                    │
├──────────────────┬──────────────────┬─────────────────┬──────────────┤
│   API Server     │   Scraper        │   Bot Handler   │  Elastic Sync│
│ `main-api.ts`    │ `main-scraper.ts`│ `main-bot.ts`   │`main-elastic.ts`
└────────┬─────────┴────────┬─────────┴────────┬────────┴──────┬───────┘
         │                  │                  │              │
         ▼                  ▼                  ▼              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    Application Layer (Use Cases)                     │
│ ┌───────────────────────────────────────────────────────────────┐   │
│ │ Scraping:                                                     │   │
│ │ - ScraperOrchestrator (orchestrates worker pipeline)         │   │
│ │ - StartScraperUseCase, StopScraperUseCase (lifecycle control)│   │
│ │ - ChannelPriorityCalculator (priority scheduling)            │   │
│ │                                                               │   │
│ │ Search:                                                       │   │
│ │ - FindCaptionsUseCase (query Elasticsearch)                  │   │
│ │ - SyncDataToElasticUseCase (periodic index sync)             │   │
│ │                                                               │   │
│ │ Telegram Bot:                                                │   │
│ │ - TelegramBot (Telegraf framework, command registration)    │   │
│ │ - *Controller classes (command handlers)                     │   │
│ └───────────────────────────────────────────────────────────────┘   │
└────────┬────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────────┐
│                   Worker & Queue Layer (Scrapers)                    │
│ ┌──────────────────┬──────────────┬──────────────┬────────────────┐ │
│ │ Channel Discovery│ Channel Info │ Video List   │ Video Details  │ │
│ │ SearchChannel-   │ ChannelEntries│ChannelsWorker│VideoEntriesWorker
│ │ QueriesWorker    │ Worker       │              │                │ │
│ └──────────────────┴──────────────┴──────────────┴────────────────┘ │
└────────┬────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────────┐
│                   Infrastructure & Persistence Layer                 │
│  ┌─────────────────────┐    ┌──────────────┐    ┌───────────────┐  │
│  │  PostgreSQL         │    │  Elasticsearch│    │  yt-dlp/API   │  │
│  │  DatabaseClient     │    │  CaptionsSync │    │  YoutubeAPI   │  │
│  │  (Kysely ORM)       │    │  Repository   │    │  Extractors   │  │
│  └─────────────────────┘    └──────────────┘    └───────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

## Component Responsibilities

| Component | Responsibility | File |
|-----------|----------------|------|
| ApiServer | HTTP server for caption search via GET `/api/search` | `src/modules/api/api-server.ts` |
| ScraperOrchestrator | Manages worker lifecycle, executes workers in pipeline order | `src/modules/scraping/scraper.orchestrator.ts` |
| ChannelPriorityCalculator | Calculates channel scrape priority based on age, view count, subscriber count | `src/modules/scraping/channel-priority/channel-priority.calculator.ts` |
| TelegramBot | Registers command handlers, enforces chat authentication | `src/modules/telegram/telegram-bot.ts` |
| DatabaseClient | Kysely ORM instance wrapping PostgreSQL pool | `src/db/client.ts` |
| YoutubeApiGetVideo | Fetches video metadata, captions via yt-dlp or YouTube direct APIs | `src/modules/youtube-api/yt-api-get-video.ts` |
| SearchChannelQueriesWorker | Discovers channels by searching YouTube | `src/modules/scraping/scrapers/channel-discovery/search-channel-queries.worker.ts` |
| ChannelEntriesWorker | Fetches channel metadata and video list | `src/modules/scraping/scrapers/channel/channel-entries.worker.ts` |
| ChannelsWorker | Video discovery: iterates channels, enqueues videos | `src/modules/scraping/scrapers/video-discovery/channels.worker.ts` |
| VideoEntriesWorker | Fetches video metadata, captions, persists to DB | `src/modules/scraping/scrapers/video/video-entries.worker.ts` |

## Pattern Overview

**Overall:** Layered architecture with dependency injection (Inversify), monolithic Node.js application split into distinct process roles (API, Scraper, Bot, Elastic sync).

**Key Characteristics:**
- **Dependency Injection:** Classes use `@injectable()` decorator; IoC container instantiates and wires dependencies
- **Use Case Pattern:** Business logic encapsulated in use-case classes with single `execute()` method
- **Result Type:** All async operations return `Result<Value, Error>` discriminated union (Success/Failure)
- **Worker Pipeline:** Scraper orchestrator runs workers sequentially in fixed order with timeout/stop flags
- **Queue-Based Processing:** Each worker pulls items from a queue (database), processes, updates status
- **Error Handling:** Structured error objects with type discriminants; no exceptions thrown across boundaries
- **Module Organization:** Feature-based modules (`scraping`, `captions-search`, `telegram`, `youtube-api`) with internal layering

## Layers

**Presentation:**
- Purpose: HTTP endpoints and Telegram command handlers
- Location: `src/modules/api/api-server.ts`, `src/modules/telegram/*`
- Contains: ApiServer, TelegramBot, controller classes
- Depends on: Use cases, services
- Used by: HTTP clients, Telegram clients

**Application (Use Cases):**
- Purpose: Orchestrate business workflows; coordinate domain logic
- Location: `src/modules/*/use-cases/`, `src/modules/scraping/scraper.orchestrator.ts`
- Contains: `*UseCase` classes, orchestrator, schedulers
- Depends on: Repositories, services, external APIs
- Used by: Presentation, lifecycle listeners

**Domain (Services & Queues):**
- Purpose: Encapsulate domain logic; manage transactional boundaries
- Location: `src/modules/*/scrapers/*/worker.ts`, `src/modules/*/*.service.ts`, `src/modules/*/*.queue.ts`
- Contains: Workers (async state machines), services (analyzers, validators), queues (dequeue/enqueue logic)
- Depends on: Repositories, external APIs
- Used by: Use cases, orchestrator

**Data Access (Repositories):**
- Purpose: Encapsulate persistence details; provide query/mutation interfaces
- Location: `src/modules/*/*.repository.ts`, `src/db/`
- Contains: Repository classes with methods like `findBy()`, `insert()`, `updateStatus()`; DatabaseClient
- Depends on: Kysely ORM, Elasticsearch client
- Used by: Services, workers, queues

**External Integration:**
- Purpose: Wrap third-party APIs; provide normalized interfaces
- Location: `src/modules/youtube-api/*`, `src/modules/captions-search/*`
- Contains: API client classes (YoutubeApiGetVideo, YtDlpClient), extractors, parsers
- Depends on: HTTP clients, npm packages (axios, yt-dlp-nodejs, @elastic/elasticsearch)
- Used by: Services, use cases

## Data Flow

### Primary Request Path: Video Scraping Cycle

1. **Initialization** (`main-scraper.ts:30-40`)
   - IoC container wires dependencies
   - ScraperOrchestrator created as singleton
   - ScraperStatusService polls DB for requested state
   - StartScraperUseCase invoked on state change to RUNNING

2. **Channel Discovery** → **Channel Data** → **Video List** → **Video Details** (sequential phases, each with timeout)
   - **Phase 1: Search Channels** (`SearchChannelQueriesWorker`)
     - Dequeue a search query from `searchChannelQueries` table
     - Call YouTube search API via `YoutubeApiClient` (yt-dlp)
     - Enqueue discovered channel IDs into `channelEntries` queue
     - Return WorkerStopCause.EMPTY when queue exhausted
   
   - **Phase 2: Channel Metadata** (`ChannelEntriesWorker`)
     - Dequeue channel ID from `channelEntries` queue
     - Fetch channel info via `YoutubeApiGetChannel`
     - Persist channel metadata to `channels` table
     - Enqueue discovered video IDs into `videoDiscoveryJobs` queue
   
   - **Phase 3: Video Discovery** (`ChannelsWorker`)
     - Dequeue channel from `channelDiscoveryJobs` queue
     - Fetch latest videos via `YoutubeApiGetChannelVideos`
     - Enqueue video entries into `videoJobs` queue
   
   - **Phase 4: Video Detail Processing** (`VideoEntriesWorker`, longest timeout ~1 hour)
     - Dequeue video ID from `videoJobs` queue (ordered by priority)
     - Call `ProcessVideoEntryUseCase` → `YoutubeApiGetVideo`
     - Fetch video metadata: title, description, duration, statistics
     - Fetch captions: auto-generated and manually created
     - Analyze captions (`CaptionAnalysisService`): length, overlap, uppercase ratio
     - Persist video record, caption entries to `videos`, `captions` tables
     - Enqueue captions to `transcriptionJobs` if valid
     - Update `videoJobs` status to SUCCEEDED or SKIPPED
     - On worker error, enqueue to `ProcessScraperFailure` handler

3. **Status Management**
   - ScraperStatusService tracks requested vs actual state in `scrapingProcess` table
   - ScraperHeartbeat updates heartbeat timestamp every 30s
   - On graceful stop: set requested state STOPPED, workers finish current item, orchestrator exits
   - On error: ProcessScraperFailureUseCase logs and may restart

### Caption Search Request Path

1. **HTTP GET `/api/search?q=word`** (`api-server.ts:30-59`)
2. **FindCaptionsUseCase** → **CaptionsService.search()**
3. **ElasticsearchClient** queries `captions` index
4. Returns array of hits with videoId, startTime, text
5. Response formatted as JSON, sent to client

### Telegram Command Path

1. **Telegraf framework** receives message
2. **Auth middleware** checks chat ID
3. **Router** matches command string to controller
4. **Controller** (e.g., `LifecycleController`) calls corresponding use case
5. **Use case** executes domain logic
6. **Result** serialized and sent back via Telegram API

### Elasticsearch Sync Loop

1. **main-elastic.ts** runs `SyncDataToElasticUseCase` every 60 seconds
2. Query `videos` table for modified captions since last sync
3. Read `captions` for each video
4. Bulk index into Elasticsearch `captions` index
5. Update `elasticCaptionsSync` tracking table
6. On error, retry on next interval

**State Management:**
- **Scraper state:** Requested vs actual status stored in `scrapingProcess` table
- **Queue state:** Each job record has `status` (PENDING, PROCESSING, SUCCEEDED, SKIPPED, FAILED) and `statusUpdatedAt`
- **Global flags:** `ScraperOrchestrator.shouldContinueFlag`, `isRunning` prevent concurrent execution

## Key Abstractions

**Result Type:**
- Purpose: Represents success or failure without exceptions
- Examples: `Result<VideoProps, DatabaseError>` in `ProcessVideoEntryUseCase`
- Pattern: Discriminated union with `ok: true | false` branch; enables functional error chaining

**Worker:**
- Purpose: Async state machine that dequeues items, processes, updates status
- Examples: `VideoEntriesWorker`, `ChannelsWorker`
- Pattern: `run({shouldContinue, onError})` accepts abort signal; returns `Result<WorkerStopCause, Error>`

**Use Case:**
- Purpose: Single business operation; orchestrates dependencies
- Examples: `StartScraperUseCase`, `ProcessVideoEntryUseCase`
- Pattern: `@injectable()` class with `execute()` method; injected repositories/services

**Queue:**
- Purpose: Database-backed job queue; atomic dequeue with status transition
- Examples: `VideoEntriesQueue`, `ChannelsQueue`
- Pattern: `getNextEntry()` returns next pending item or null; `enqueue()` inserts new job

**Repository:**
- Purpose: Data access abstraction; query builder wrapper
- Examples: `VideoRepository`, `ChannelRepository`
- Pattern: Methods like `findById()`, `insert()`, `updateStatus()`; builds on Kysely

**Service (Analyzer/Validator):**
- Purpose: Domain logic for classification, analysis, transformation
- Examples: `CaptionAnalysisService` (validates caption quality), `ChannelPriorityCalculator` (scores channels)
- Pattern: Stateless class with methods taking domain objects; no persistence

## Entry Points

**API Server** (`src/main-api.ts`):
- Location: `src/main-api.ts:8-26`
- Triggers: `npm start:api` or direct Node.js invocation
- Responsibilities: Bind Logger, ApiServer to IoC container; start HTTP server on port 3001; listen for SIGTERM/SIGINT

**Scraper Process** (`src/main-scraper.ts`):
- Location: `src/main-scraper.ts:17-70`
- Triggers: `npm start:scraper` or container orchestration
- Responsibilities: Set up DI container with singleton DatabaseClient, YtDlpClient, ScraperOrchestrator; start command listener; initialize workers; run heartbeat and scheduler; handle graceful shutdown

**Telegram Bot** (`src/main-bot.ts`):
- Location: `src/main-bot.ts:11-38`
- Triggers: `npm start:bot` or separate process
- Responsibilities: Create TelegramBot, ScraperStatusWatcher; start bot polling; emit notifications

**Elasticsearch Sync** (`src/main-elastic.ts`):
- Location: `src/main-elastic.ts:10-50+`
- Triggers: `npm start:elastic` or separate process
- Responsibilities: Periodically sync captions to Elasticsearch index

## Architectural Constraints

- **Threading:** Single-threaded JavaScript event loop; async/await for I/O concurrency; no worker threads
- **Global state:** 
  - `ScraperOrchestrator.isRunning`, `shouldContinueFlag` (prevents duplicate start/stop)
  - DatabaseClient singleton connection pool (max 10 connections)
  - Logger file handles (appends to `logs/{category}`)
- **Circular imports:** None detected; modules organize hierarchically (domain → use case → controller)
- **Synchronous vs Async:** All I/O is async (DB queries, HTTP, Telegram API); sync operations only for logging, validation
- **Database Transactions:** Used in queue dequeue operations (SKIP LOCKED) to ensure at-most-once processing
- **Process Model:** Four independent processes (API, Scraper, Bot, ElasticSync) communicate via shared PostgreSQL DB and Telegram API

## Anti-Patterns

### Missing Error Context in Result Types

**What happens:** Error objects are plain discriminated types (`{ type: string }`) with minimal context; stack traces not preserved across Result boundaries.

**Why it's wrong:** When a Result fails, the caller sees only type and message; underlying cause (network timeout, DB constraint, API rate limit) is lost. Debugging requires log file inspection.

**Do this instead:** Enhance BaseError to carry context object and error cause chain. See `logger.ts:97-100` for example serialization of error causes. Update Result-returning functions to preserve error.cause.

### Hardcoded Channel Skip in Video Queue

**What happens:** `VideoEntriesQueue.getNextEntry()` at line 55 hard-codes channel ID `"UCPHpx55tgrbm8FrYYCflAHw"` in WHERE clause with TODO comment.

**Why it's wrong:** Members-only videos are skipped only for this one channel; other channels with same issue still enqueue jobs. Temporary workaround blocks maintainability.

**Do this instead:** Add `isBlocklisted` flag to `channels` table or create `blockedChannels` table. Update queue logic to filter dynamically. Move to configuration.

### Inconsistent Caption Status Enums

**What happens:** `AutoCaptionsStatus` and `ManualCaptionsStatus` have different status values (e.g., "CAPTIONS_MOSTLY_UPPERCASE" only on manual). ProcessVideoEntryUseCase line 16-23 only persists captions with subset of statuses.

**Why it's wrong:** If auto captions have "MOSTLY_UPPERCASE", they're not persisted even if manually are valid. Asymmetric logic is error-prone.

**Do this instead:** Unify status enum; store analyzer results separately (e.g., `captionMetrics` table with length, uppercase_ratio, overlap_count). Use metrics in search ranking, not persistence gate.

### No Retry Logic for Transient Failures

**What happens:** If YoutubeApiGetVideo fails (network timeout, rate limit), the error is propagated; job marked FAILED; no retry scheduled.

**Why it's wrong:** YouTube API is rate-limited; transient failures (429, timeout) block video from ever being retried without manual re-enqueue.

**Do this instead:** Distinguish transient vs permanent errors in YoutubeApiClient. For transient, re-enqueue with delay. For permanent (404, 410), mark SKIPPED with cause. Add exponential backoff queue.

## Cross-Cutting Concerns

**Logging:** 
- Framework: Custom Logger class at `src/modules/_common/logger/logger.ts`
- Pattern: Inject Logger, call `.info()`, `.error()`, `.warn()` methods
- Files: Logs appended to `logs/{category}` by category name
- Context: Logger tracks `context` (service name) and `category` (feature area); child loggers nest contexts

**Validation:** 
- Framework: Zod and Valibot schemas
- Pattern: Define schema, call `.parse()` or `.safeParse()`
- Example: `src/modules/youtube-api/youtube-api.schemas.ts` defines video/channel response schemas
- Location: `src/modules/_common/validation/validator.ts` wraps validation logic

**Authentication:** 
- Telegram: Chat ID whitelist in `TelegramBot` middleware
- API: No authentication (internal search endpoint); CORS headers allow any origin
- YouTube: Implicit via yt-dlp authentication (bearer token or cookie if set in env)

---

*Architecture analysis: 2026-07-26*
