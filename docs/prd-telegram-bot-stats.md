## Problem Statement

There is no way to check the health and progress of the scraping pipeline without querying the database directly. The operator needs a quick, convenient way to see job statuses and video caption quality metrics from Telegram.

## Solution

Add a Telegram bot with a `/stats` command that returns a summary of all job statuses across the pipeline and the count of videos with valid manual captions. The bot uses long polling via Telegraf and is restricted to the operator's chat.

## User Stories

1. As an operator, I want to send `/stats` to the Telegram bot, so that I can quickly see the state of all jobs without querying the database.
2. As an operator, I want to see the count of jobs grouped by status (PENDING, PROCESSING, SUCCEEDED, FAILED) for each job type, so that I can identify bottlenecks or failures in the pipeline.
3. As an operator, I want to see the count of videos with CAPTIONS_VALID manual caption status, so that I can track how much usable content has been processed.
4. As an operator, I want the bot to be restricted to my chat only, so that unauthorized users cannot query my system.
5. As an operator, I want the bot to run alongside the scrapers in the same process, so that I don't need to manage a separate deployment.
6. As an operator, I want the bot to shut down gracefully when the process receives SIGINT/SIGTERM, so that polling stops cleanly.
7. As an operator, I want the stats message to be formatted in a readable way with counts per job type on separate lines, so that I can parse it at a glance.

## Implementation Decisions

- **Framework**: Telegraf (Node.js Telegram bot framework), using long polling transport.
- **Bot module location**: `src/modules/telegram-bot/` — owns Telegraf instance creation, auth middleware, controller registration, and lifecycle (launch/stop).
- **Controller location**: `src/modules/scrapers/telegram/` — colocated with the scrapers domain module. Thin handler that calls the use case and replies. This pattern supports future growth to ~30 commands across multiple domain modules.
- **Controller pattern**: Each domain module exports a `register*Commands(bot)` function. The bot module calls all registrations. Controllers are considered the equivalent of HTTP controllers — a UI boundary layer.
- **Auth middleware**: Bot-level middleware that checks `ctx.chat.id` against `TELEGRAM_CHAT_ID` env var. Rejects all messages from other chats.
- **StatsRepository**: New repository that queries all 5 job tables (`channelDiscoveryJobs`, `channelJobs`, `videoDiscoveryJobs`, `videoJobs`, `transcriptionJobs`) for `SELECT status, COUNT(*) GROUP BY status`, plus `SELECT COUNT(*) FROM videos WHERE manualCaptionsStatus = 'CAPTIONS_VALID'`. Uses the existing Kysely `dbClient`.
- **GetStatsUseCase**: Calls `StatsRepository`, formats the result into a human-readable Telegram message string.
- **Message format**:
  ```
  Job Stats

  Channel Discovery: 3 PENDING | 1 PROCESSING | 42 SUCCEEDED | 2 FAILED
  Channel: 0 PENDING | 0 PROCESSING | 40 SUCCEEDED | 0 FAILED
  Video Discovery: 5 PENDING | 1 PROCESSING | 38 SUCCEEDED | 1 FAILED
  Video: 12 PENDING | 3 PROCESSING | 350 SUCCEEDED | 5 FAILED
  Transcription: 20 PENDING | 2 PROCESSING | 100 SUCCEEDED | 0 FAILED

  Videos with CAPTIONS_VALID (manual): 280
  ```
- **Global entrypoint**: New `src/main.ts` that launches the bot and runs the existing scrapers main. Owns SIGINT/SIGTERM handlers that call `bot.stop()`.
- **Dependency injection**: New classes registered in the Inversify container, following existing patterns.
- **New dependency**: `telegraf` npm package.

## Testing Decisions

No tests planned for this iteration.

## Out of Scope

- Start/stop scrapers via Telegram commands (deferred to future work).
- Refactoring `scrapers/main.ts` to export `startScrapers()` (deferred — global main will import and call the existing scrapers main directly for now).
- `ScrapersLifecycleService` (deferred to start/stop work).
- Webhook transport (long polling chosen for simplicity).
- Restart support after stop.
- Any other bot commands beyond `/stats`.

## Further Notes

- The architecture is designed to scale to ~30 commands. Each domain module will have its own `telegram/` folder with controllers. The bot module assembles them.
- When start/stop scraper commands are added later, a `ScrapersLifecycleService` will be introduced to manage scraper state, and `scrapers/main.ts` will be refactored to export a callable function.
