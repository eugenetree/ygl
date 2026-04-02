## Problem Statement

The customer wants visibility into when the scraping system starts and the ability to control scraper execution remotely via Telegram. Currently, scrapers auto-start on boot and can only be stopped by sending SIGTERM/SIGINT to the process. There is no way to start, stop, or restart scrapers without SSH access to the server.

## Solution

Add Telegram-based lifecycle control for the scraper loop. The system sends a notification when scrapers start, and the customer can issue `/start`, `/stop`, and `/kill` commands via the existing Telegram bot to control scraper execution. The Telegram bot remains alive independently of scraper state, so the customer can always interact with it.

## User Stories

1. As a customer, I want to receive a Telegram message when scrapers start, so that I know the system is up and scraping.
2. As a customer, I want to send `/stop` to gracefully stop all scrapers, so that the current item finishes processing before the loop exits.
3. As a customer, I want to send `/kill` to immediately abort all scrapers, so that I can force-stop the system when something is wrong.
4. As a customer, I want to see a confirmation prompt (Yes/No inline keyboard) before `/kill` executes, so that I don't accidentally abort mid-work.
5. As a customer, I want to send `/start` to re-launch the scraper loop after it was stopped or killed, so that I can resume scraping without restarting the server.
6. As a customer, I want to receive a message saying "Scrapers are already running" if I send `/start` while scrapers are active, so that I don't accidentally double-run.
7. As a customer, I want to receive a message saying "Scrapers are not running" if I send `/stop` or `/kill` while scrapers are idle, so that I get clear feedback.
8. As a customer, I want to see the current scraper state (Running/Stopped) in the `/stats` output, so that I can check system status at any time.
9. As a customer, I want scrapers to auto-start when the system boots, so that I don't have to manually start them every time.
10. As a customer, I want to receive a notification when scrapers stop (gracefully, killed, errored, or queue exhausted), so that I know the current state without checking manually.
11. As a customer, I want the Telegram bot to remain alive even when scrapers are stopped, so that I can always issue commands.
12. As a customer, I want `/stop` to finish the currently processing item before exiting, so that no work is lost.
13. As a customer, I want `/kill` to abort immediately without cleaning up stuck jobs, so that the system stops as fast as possible.

## Implementation Decisions

- **ScraperLifecycleService (new module):** A state machine that owns scraper lifecycle. Interface: `start()`, `stop()`, `kill()`, `getState()`. Manages the `shouldContinue` flag and an `AbortController` for hard kills. This is the central coordination point — all other components call into it rather than managing state themselves.

- **LifecycleController (new module):** A single Telegram controller handling `/start`, `/stop`, and `/kill` commands. Thin layer that translates Telegram commands into lifecycle service calls and formats responses. Implements inline keyboard confirmation for `/kill`.

- **StatsController (modified):** Prepend current scraper state (Running/Stopped) to the existing stats output by reading from the lifecycle service.

- **Scraper loop (modified):** The scraper orchestration loop accepts an abort signal from the lifecycle service. It checks both the existing `shouldContinue` flag (for graceful stop) and the abort signal (for hard kill). Returns control to the lifecycle service when done.

- **main.ts (modified):** Wire up the lifecycle service, register the new controller with the Telegram bot, and send a "scrapers started" notification via the existing `TelegramNotificationService` when the scraper loop begins.

- **Bot and scraper lifecycle decoupled:** The Telegram bot starts and stays alive independently. Scrapers are launched by the lifecycle service. Stopping scrapers does not stop the bot. This is a change from current behavior where both are tied together.

- **Graceful stop (`/stop`):** Sets the `shouldContinue` flag to false. The current scraper finishes its current item, then the loop exits. Same mechanism as existing SIGTERM handling, but scoped to scrapers only.

- **Hard kill (`/kill`):** Aborts via `AbortController`. The current operation is interrupted immediately. Jobs left in PROCESSING state are left as-is (not reset to PENDING). The customer accepts potential stuck jobs as a tradeoff for immediate stop.

- **Notifications on state changes:** The system sends Telegram notifications for all scraper state transitions: started, stopped (graceful), killed, errored, and queue exhausted.

- **No cooldown or rate limiting** on start/stop commands.

## Testing Decisions

No automated tests planned for this feature. The modules are thin enough to verify manually via Telegram interaction.

## Out of Scope

- Per-scraper start/stop control (e.g., stopping only video-discovery while channel scraper continues). Scrapers run as a sequential pipeline and are controlled as a single unit.
- Resetting stuck PROCESSING jobs after `/kill`. Jobs are left as-is.
- Webhook-based Telegram bot (staying with long polling).
- Any changes to the scraper logic itself — only the lifecycle wrapper around the existing loop.

## Further Notes

- The existing `shouldContinue` pattern (used for SIGTERM/SIGINT) should be reused for graceful stop, but the process-level signal handlers should remain so that Docker stop/restart still works as expected.
- The inline keyboard for `/kill` confirmation should use Telegraf's callback query handling.
