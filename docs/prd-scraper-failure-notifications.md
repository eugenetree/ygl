## Problem Statement

The scraper system runs four sequential workers in a loop (channel-discovery, channel, video-discovery, video). When failures occur — whether a single item fails to process or a worker crashes entirely — the system only logs the error. There is no external notification, so failures go unnoticed until someone manually checks the logs.

## Solution

Add Telegram notifications for all scraper failures. Workers accept an `onError` callback configured by `main.ts`. The callback triggers a `ProcessScraperFailure` use case that sends a Telegram message and returns `{ shouldContinue: boolean }` to control whether the worker keeps running or stops.

Failure strategies differ by worker type:
- **Non-video workers** (channel-discovery, channel, video-discovery): notify on failure, continue processing.
- **Video worker**: notify on failure, stop the worker, stop `main.ts` entirely.

## User Stories

1. As a developer, I want to receive a Telegram message when any scraper item fails, so that I can react without watching logs.
2. As a developer, I want non-video workers to continue processing after a failure, so that one bad item doesn't block the entire pipeline.
3. As a developer, I want the video worker to stop on failure and the whole process to exit, so that I can investigate before more items are affected.
4. As a developer, I want the failure notification to include the scraper name and error details, so that I can quickly identify what went wrong.
5. As a developer, I want Telegram delivery failures to be logged but not crash the system, so that a notification outage doesn't take down scraping.
6. As a developer, I want to configure the Telegram bot token and chat ID via environment variables, so that credentials stay out of code.
7. As a developer, I want the notification logic decoupled from workers via a callback, so that workers remain pure and testable without notification awareness.

## Implementation Decisions

### Modules

1. **`TelegramNotificationService`** (new, in `_common/`)
   - Injectable service wrapping Telegram Bot API `sendMessage` endpoint.
   - Reads `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` from environment variables.
   - Single method: `sendMessage(text: string): Promise<Result<void, BaseError>>`.
   - Uses existing `HttpClient` (axios) — no new dependencies.
   - Swallows its own errors: callers get a `Failure` result but never an exception.

2. **`ProcessScraperFailureUseCase`** (new, in `scrapers/_common/`)
   - Depends on `Logger` and `TelegramNotificationService`.
   - `execute({ scraperName: string, error: BaseError }): Promise<Result<void, BaseError>>`.
   - Formats the error into a human-readable Telegram message (scraper name + error type + details).
   - If Telegram fails, logs the delivery failure and returns `Success` anyway (notification failure is non-fatal).

3. **Worker `onError` callback pattern**
   - All four workers' `start()` method accepts an options object: `{ shouldContinue?: () => boolean, onError?: (error: BaseError) => Promise<{ shouldContinue: boolean }> }`.
   - When a use case returns a `Failure`, the worker calls `onError(error)`.
   - If `onError` returns `{ shouldContinue: false }`, the worker stops.
   - If `onError` returns `{ shouldContinue: true }`, the worker proceeds to the next item.
   - If `onError` is not provided, the worker falls back to current behavior (continue for non-video, stop for video).

4. **`main.ts` wiring**
   - Instantiates `ProcessScraperFailureUseCase` (with `TelegramNotificationService`).
   - Passes `onError` callbacks to each worker's `spawnWorker`:
     - Non-video workers: calls `processScraperFailure.execute(...)`, returns `{ shouldContinue: true }`.
     - Video worker: calls `processScraperFailure.execute(...)`, returns `{ shouldContinue: false }`.
   - When the video worker returns (due to failure), `main.ts` exits the process.

5. **Bootstrap files**
   - `spawnWorker` functions in all four bootstrap files gain an `onError` parameter and pass it through to `worker.start()`.

6. **Environment variables**
   - `TELEGRAM_BOT_TOKEN` — bot API token.
   - `TELEGRAM_CHAT_ID` — target chat/channel ID for notifications.
   - Added to `.env.example`.

### Architectural Decisions

- Workers have zero knowledge of notifications. The `onError` callback is an inversion-of-control pattern — `main.ts` decides what happens on failure.
- `ProcessScraperFailureUseCase` is a proper use case (not just a service call) because it represents a business operation: "react to a scraper failure." Future growth (e.g., write failure to DB, trigger recovery, escalate after N failures) stays in this use case.
- `TelegramNotificationService` lives in `_common/` because it's general-purpose infrastructure, not scraper-specific. Other modules could reuse it.
- Telegram errors are non-fatal everywhere — notification failure never stops scraping.

## Testing Decisions

- A good test verifies external behavior through the public interface, not implementation details.
- **`ProcessScraperFailureUseCase`** should be tested:
  - Calls `TelegramNotificationService.sendMessage` with formatted message containing scraper name and error.
  - Returns `Success` even when Telegram delivery fails.
  - Prior art: `process-video-entry.use-case.test.ts` — same mock pattern (constructor injection of mocked dependencies, `mock.fn()` from `node:test`).
- Workers do not need new tests for the `onError` callback — it's a simple delegation that's covered by the caller (`main.ts`).

## Out of Scope

- Notification throttling/deduplication (e.g., suppressing repeated failures for the same item).
- Non-Telegram notification channels (email, Slack, etc.).
- Failure recovery automation (e.g., auto-retry after notification).
- Dashboard or UI for failure history.
- Persisting failure records to the database.

## Further Notes

- The `onError` callback pattern is extensible. If future requirements need different failure reactions (e.g., "pause for 5 minutes then retry"), the callback signature supports it without changing workers.
- The video worker's "stop on failure" behavior means a single bad video entry halts all scraping. This is intentional — video processing is the most critical and expensive stage. If this proves too aggressive, it can be relaxed by changing the callback in `main.ts` without touching worker code.
