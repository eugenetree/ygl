<!-- GSD:project-start source:PROJECT.md -->

## Project

**YGL — YouTube Channel Caption Scraper**

A YouTube caption scraping system that discovers channels, fetches video metadata and captions, indexes them in Elasticsearch, and exposes a search API. A Telegram bot serves as the control interface for operators to manage and monitor the scraper pipeline.

**Core Value:** Operators can monitor and control the scraping pipeline through Telegram — the bot is the primary operational window into system state.

### Constraints

- **Pattern**: New commands must follow the existing controller pattern in `src/modules/telegram/`
- **Stack**: TypeScript, Kysely ORM, Inversify DI, Telegraf bot framework

<!-- GSD:project-end -->

<!-- GSD:stack-start source:codebase/STACK.md -->

## Technology Stack

## Languages

- TypeScript 5.7.0 - All backend and frontend source code
- JavaScript - Runtime output compiled from TypeScript
- Shell (Bash/sh) - Docker entrypoints and deployment scripts
- SQL - Database migrations and queries (through Kysely ORM)

## Runtime

- Node.js 22 (Alpine) - Backend runtime
- npm - Package manager
- npm - Lockfile: `package-lock.json` (present)

## Frameworks

- inversify 7.9.1 - Dependency injection container
- Telegraf 4.16.3 - Telegram bot framework (for bot control interface)
- Kysely 0.27.5 - Type-safe SQL query builder with PostgreSQL support
- pg 8.12.0 - PostgreSQL driver
- @elastic/elasticsearch 8.12.0 - Elasticsearch client for caption search
- Next.js 15.1.0 - React framework for web UI
- React 19.0.0 - UI library
- React-DOM 19.0.0 - React DOM rendering
- axios 1.7.7 - HTTP client with proxy and request queue support
- ytdlp-nodejs 3.4.2 - Node.js wrapper for yt-dlp (video/caption extraction)
- youtube-search-api 1.2.2 - YouTube search functionality
- compromise 14.15.0 - Natural language processing for text analysis
- lodash-es 4.17.21 - Utility functions
- valibot 0.37.0 - Schema validation
- zod 3.23.8 - Schema validation and type inference
- adm-zip 0.5.17 - ZIP file handling
- reflect-metadata 0.2.2 - Required for inversify decorators

## Testing

- Node.js built-in test runner - `node --test` command
- pg-mem 3.0.14 - In-memory PostgreSQL mock database for testing
- Node.js built-in assert/strict - Standard assertions

## Build & Development

- TypeScript (tsc) - Compilation to CommonJS
- tsx 4.21.0 - TypeScript execution for scripts
- Biomejs 2.4.16 - Linter and code formatter
- @babel/plugin-proposal-decorators 7.28.0 - Legacy decorator support
- @babel/preset-typescript 7.28.5 - TypeScript Babel preset
- husky 9.1.7 - Git hook manager
- lint-staged 17.2.0 - Run linters on staged files
- nodemon 3.1.4 - Auto-reload during development
- ts-node 10.9.2 - Direct TypeScript execution

## Configuration

- Environment variables for configuration (see INTEGRATIONS.md for required vars)
- Database connection via `POSTGRES_*` environment variables
- Elasticsearch via `ES_NODE` environment variable
- Telegram bot via `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID`
- TypeScript compiles to CommonJS in `dist/` directory
- Source maps disabled
- Strict type checking enabled
- CommonJS modules (Node.js compatible)
- ES modules in frontend (Next.js)

## Platform Requirements

- Node.js 22 (Alpine-compatible)
- PostgreSQL 18 (via Docker)
- Elasticsearch 8.12.0 (via Docker)
- OpenVPN (for scraper with VPN support)
- yt-dlp binary (downloaded in Docker build)
- Node.js 22 (Alpine base)
- PostgreSQL 18
- Elasticsearch 8.12.0
- Docker & Docker Compose for orchestration
- OpenVPN configuration for scraper instances

## Deployment

- Multi-stage production builds (Dockerfile.prod)
- Development builds with live reload (Dockerfile.dev)
- Specialized scraper image with VPN support (Dockerfile.scraper)
- Base: node:22-alpine
- Docker Compose - Coordinates bot, scraper, API, sync services
- Services deployed as containers with shared PostgreSQL and Elasticsearch

<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->

## Conventions

## Naming Patterns

- PascalCase for class files: `ChannelPriorityCalculator.ts`
- camelCase for utility/factory files: `caption-analysis.service.ts`, `push-channel.use-case.ts`
- Suffix pattern by type:
- camelCase for all function names and methods
- Private methods prefixed with `private`: `private resolveAutoStatus()`
- Async functions clearly marked with `async` keyword
- Method names descriptive of action: `calculate()`, `execute()`, `validate()`, `analyze()`
- camelCase for all variables: `videoId`, `channelId`, `totalProcessed`
- Const for immutable values: `const baseStats = {...}`
- Descriptive names over short abbreviations (except for well-known domain terms)
- Boolean variables prefix with `is`, `has`, `should`, `can`: `isBoosted`, `languageGateActive`
- PascalCase for all type/interface names: `ChannelStats`, `PriorityScores`, `Result<Value, Error>`
- Branded discriminated unions for domain types: `AutoCaptionsStatus`, `ManualCaptionsStatus`
- Type suffixes for clarity: `...Props`, `...Result`, `...Error`
- Use `type` keyword for type aliases, not `interface`

## Code Style

- Tool: Biome v2.4.16
- Indentation: 2 spaces
- Line width: 80 characters
- Quote style: double quotes (`"`)
- Trailing commas: all
- Tool: Biome recommended rules (enabled)
- Exception: `useImportType` disabled (allows regular imports vs. `import type`)
- Migrations override: disable `noExplicitAny` for `src/db/migrations/**`
- Target: ES2022
- Strict mode enabled (`strict: true`)
- `experimentalDecorators` and `emitDecoratorMetadata` enabled (for inversify support)
- `forceConsistentCasingInFileNames` enabled
- Module system: commonjs

## Import Organization

- No path aliases configured; use relative paths only
- Import paths respect module boundaries (e.g., cannot import internal types from external modules)
- Use named imports where possible: `import { Success, Failure } from "../../types/index.js"`
- Use default imports for classes/services when single main export
- Always include `.js` extension for TypeScript files in imports

## Error Handling

- Result type pattern: `Result<Value, Error>` with `Success()` and `Failure()` constructors
- All async operations that can fail return `Promise<Result<T, E>>`
- Error checking via `.ok` property: `if (!result.ok) return result;`
- Explicit error types with `type` discriminator: `{ type: "DATABASE", message: "..." }`
- Error chaining via `cause` property for nested errors
- `tryCatch<T, E>()` function in `src/modules/_common/try-catch.ts` converts promises to Result type
- Used for wrapping third-party promise-based APIs

## Logging

- Takes `context` (service-specific marker) and `category` (overall application) as constructor params
- Context converted to kebab-case automatically: `ApiServer` → `api-server`
- Logs written to `logs/` directory by category
- `logger.info(message: string)` - Information messages
- `logger.error({ message?: string, error?: unknown, context?: Record })` - Error logging with stack trace and cause serialization
- `logger.warn(message: string)` - Warning messages
- `logger.setContext(context: string)` - Append to context chain for nested scopes
- `logger.child(config: Config)` - Create child logger with new context

## Comments

- Complex algorithms that aren't self-documenting: `// High-frequency words add noise in matching...`
- Business logic gates/thresholds: `// exactly 10% = at threshold = penalty`
- Non-obvious error recovery: `// Remove speaker labels (e.g., "Sapnap:", "George:")`
- Avoid comments for obvious code; let code be self-documenting
- Minimal documentation comments used
- Only document public APIs with complex behavior
- One-liner comments preferred over verbose blocks
- Use `type` comments for type inference when needed: `as Logger` type assertions

## Function Design

- Aim for functions under 50 lines
- Break complex logic into private helper functions or methods
- Single Responsibility: each function does one thing
- Use object parameters for multiple related arguments:
- Destructure complex objects in function signature
- Max 3-5 positional parameters before switching to object
- Always return wrapped Results for fallible operations: `Promise<Result<T, E>>`
- Return early for error paths
- Use TypeScript discriminated unions for result variants

## Module Design

- Use named exports for classes and types
- Single class per file is standard
- Barrel files (`index.ts`) export public API with `export { ... } from "..."`
- `src/modules/_common/` - Shared utilities (Logger, Result types, validation helpers)
- `src/modules/{domain}/` - Domain-specific logic with use-cases, services, repositories
- Inversify decorators (`@injectable()`) on all classes meant for DI container
- Constructor dependency injection for all collaborators
- Use cases depend on repositories and services
- Services can depend on other services and utilities
- Repositories depend only on database client
- No circular imports (enforced by module boundaries)

## Class and Object Patterns

- Use for complex stateful objects and services
- Mark with `@injectable()` for DI container registration
- Constructor injection of dependencies (never field injection)
- Private fields for internal state, public for API surface
- Use `type` keyword for data contracts and domain types
- Discriminated unions for variant types: `{ type: "ADDED" } | { type: "PRIORITIZED" }`
- Readonly properties for immutable data structures
- `@injectable()` on all service classes
- `@inject(Logger)` on constructors for named bindings (rare, see `export-logs.use-case.ts`)
- Parameter decorators for Inversify container lookups

## Constants

- UPPER_SNAKE_CASE for module-level constants
- `src/modules/scraping/channel-priority/channel-priority.constants.ts` pattern for grouped constants
- Validation thresholds and algorithm weights grouped by domain
- Example: `PRIORITY_CAPTION_THRESHOLD`, `PRIORITY_SUBS_CAP`, `PRIORITY_MANUAL_BOOST`

<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->

## Architecture

## System Overview

```text

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

- **Dependency Injection:** Classes use `@injectable()` decorator; IoC container instantiates and wires dependencies
- **Use Case Pattern:** Business logic encapsulated in use-case classes with single `execute()` method
- **Result Type:** All async operations return `Result<Value, Error>` discriminated union (Success/Failure)
- **Worker Pipeline:** Scraper orchestrator runs workers sequentially in fixed order with timeout/stop flags
- **Queue-Based Processing:** Each worker pulls items from a queue (database), processes, updates status
- **Error Handling:** Structured error objects with type discriminants; no exceptions thrown across boundaries
- **Module Organization:** Feature-based modules (`scraping`, `captions-search`, `telegram`, `youtube-api`) with internal layering

## Layers

- Purpose: HTTP endpoints and Telegram command handlers
- Location: `src/modules/api/api-server.ts`, `src/modules/telegram/*`
- Contains: ApiServer, TelegramBot, controller classes
- Depends on: Use cases, services
- Used by: HTTP clients, Telegram clients
- Purpose: Orchestrate business workflows; coordinate domain logic
- Location: `src/modules/*/use-cases/`, `src/modules/scraping/scraper.orchestrator.ts`
- Contains: `*UseCase` classes, orchestrator, schedulers
- Depends on: Repositories, services, external APIs
- Used by: Presentation, lifecycle listeners
- Purpose: Encapsulate domain logic; manage transactional boundaries
- Location: `src/modules/*/scrapers/*/worker.ts`, `src/modules/*/*.service.ts`, `src/modules/*/*.queue.ts`
- Contains: Workers (async state machines), services (analyzers, validators), queues (dequeue/enqueue logic)
- Depends on: Repositories, external APIs
- Used by: Use cases, orchestrator
- Purpose: Encapsulate persistence details; provide query/mutation interfaces
- Location: `src/modules/*/*.repository.ts`, `src/db/`
- Contains: Repository classes with methods like `findBy()`, `insert()`, `updateStatus()`; DatabaseClient
- Depends on: Kysely ORM, Elasticsearch client
- Used by: Services, workers, queues
- Purpose: Wrap third-party APIs; provide normalized interfaces
- Location: `src/modules/youtube-api/*`, `src/modules/captions-search/*`
- Contains: API client classes (YoutubeApiGetVideo, YtDlpClient), extractors, parsers
- Depends on: HTTP clients, npm packages (axios, yt-dlp-nodejs, @elastic/elasticsearch)
- Used by: Services, use cases

## Data Flow

### Primary Request Path: Video Scraping Cycle

### Caption Search Request Path

### Telegram Command Path

### Elasticsearch Sync Loop

- **Scraper state:** Requested vs actual status stored in `scrapingProcess` table
- **Queue state:** Each job record has `status` (PENDING, PROCESSING, SUCCEEDED, SKIPPED, FAILED) and `statusUpdatedAt`
- **Global flags:** `ScraperOrchestrator.shouldContinueFlag`, `isRunning` prevent concurrent execution

## Key Abstractions

- Purpose: Represents success or failure without exceptions
- Examples: `Result<VideoProps, DatabaseError>` in `ProcessVideoEntryUseCase`
- Pattern: Discriminated union with `ok: true | false` branch; enables functional error chaining
- Purpose: Async state machine that dequeues items, processes, updates status
- Examples: `VideoEntriesWorker`, `ChannelsWorker`
- Pattern: `run({shouldContinue, onError})` accepts abort signal; returns `Result<WorkerStopCause, Error>`
- Purpose: Single business operation; orchestrates dependencies
- Examples: `StartScraperUseCase`, `ProcessVideoEntryUseCase`
- Pattern: `@injectable()` class with `execute()` method; injected repositories/services
- Purpose: Database-backed job queue; atomic dequeue with status transition
- Examples: `VideoEntriesQueue`, `ChannelsQueue`
- Pattern: `getNextEntry()` returns next pending item or null; `enqueue()` inserts new job
- Purpose: Data access abstraction; query builder wrapper
- Examples: `VideoRepository`, `ChannelRepository`
- Pattern: Methods like `findById()`, `insert()`, `updateStatus()`; builds on Kysely
- Purpose: Domain logic for classification, analysis, transformation
- Examples: `CaptionAnalysisService` (validates caption quality), `ChannelPriorityCalculator` (scores channels)
- Pattern: Stateless class with methods taking domain objects; no persistence

## Entry Points

- Location: `src/main-api.ts:8-26`
- Triggers: `npm start:api` or direct Node.js invocation
- Responsibilities: Bind Logger, ApiServer to IoC container; start HTTP server on port 3001; listen for SIGTERM/SIGINT
- Location: `src/main-scraper.ts:17-70`
- Triggers: `npm start:scraper` or container orchestration
- Responsibilities: Set up DI container with singleton DatabaseClient, YtDlpClient, ScraperOrchestrator; start command listener; initialize workers; run heartbeat and scheduler; handle graceful shutdown
- Location: `src/main-bot.ts:11-38`
- Triggers: `npm start:bot` or separate process
- Responsibilities: Create TelegramBot, ScraperStatusWatcher; start bot polling; emit notifications
- Location: `src/main-elastic.ts:10-50+`
- Triggers: `npm start:elastic` or separate process
- Responsibilities: Periodically sync captions to Elasticsearch index

## Architectural Constraints

- **Threading:** Single-threaded JavaScript event loop; async/await for I/O concurrency; no worker threads
- **Global state:** 
- **Circular imports:** None detected; modules organize hierarchically (domain → use case → controller)
- **Synchronous vs Async:** All I/O is async (DB queries, HTTP, Telegram API); sync operations only for logging, validation
- **Database Transactions:** Used in queue dequeue operations (SKIP LOCKED) to ensure at-most-once processing
- **Process Model:** Four independent processes (API, Scraper, Bot, ElasticSync) communicate via shared PostgreSQL DB and Telegram API

## Anti-Patterns

### Missing Error Context in Result Types

### Hardcoded Channel Skip in Video Queue

### Inconsistent Caption Status Enums

### No Retry Logic for Transient Failures

## Cross-Cutting Concerns

- Framework: Custom Logger class at `src/modules/_common/logger/logger.ts`
- Pattern: Inject Logger, call `.info()`, `.error()`, `.warn()` methods
- Files: Logs appended to `logs/{category}` by category name
- Context: Logger tracks `context` (service name) and `category` (feature area); child loggers nest contexts
- Framework: Zod and Valibot schemas
- Pattern: Define schema, call `.parse()` or `.safeParse()`
- Example: `src/modules/youtube-api/youtube-api.schemas.ts` defines video/channel response schemas
- Location: `src/modules/_common/validation/validator.ts` wraps validation logic
- Telegram: Chat ID whitelist in `TelegramBot` middleware
- API: No authentication (internal search endpoint); CORS headers allow any origin
- YouTube: Implicit via yt-dlp authentication (bearer token or cookie if set in env)

<!-- GSD:architecture-end -->

<!-- GSD:skills-start source:skills/ -->

## Project Skills

| Skill | Description | Path |
|-------|-------------|------|
| commit |  | `.claude/skills/commit/SKILL.md` |
| grill-with-docs | Grilling session that challenges your plan against the existing domain model, sharpens terminology, and updates documentation (CONTEXT.md, ADRs) inline as decisions crystallise. Use when user wants to stress-test a plan against their project's language and documented decisions. | `.agents/skills/grill-with-docs/SKILL.md` |
| improve-codebase-architecture | Find deepening opportunities in a codebase, informed by the domain language in CONTEXT.md and the decisions in docs/adr/. Use when the user wants to improve architecture, find refactoring opportunities, consolidate tightly-coupled modules, or make a codebase more testable and AI-navigable. | `.agents/skills/improve-codebase-architecture/SKILL.md` |
| to-issues | Break a plan, spec, or PRD into independently-grabbable issues on the project issue tracker using tracer-bullet vertical slices. Use when user wants to convert a plan into issues, create implementation tickets, or break down work into issues. | `.agents/skills/to-issues/SKILL.md` |
| to-prd | Turn the current conversation context into a PRD and publish it to the project issue tracker. Use when user wants to create a PRD from the current context. | `.agents/skills/to-prd/SKILL.md` |
<!-- GSD:skills-end -->

<!-- GSD:workflow-start source:GSD defaults -->

## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:

- `/gsd-quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd-debug` for investigation and bug fixing
- `/gsd-execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->

<!-- GSD:profile-start -->

## Developer Profile

> Profile not yet configured. Run `/gsd-profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
