# YouGlish-like Platform (yg)

## What This Is

A platform for learning English through real-world YouTube video clips, similar to YouGlish. A scraping pipeline discovers YouTube channels, collects their videos, and extracts captions — stored in PostgreSQL and indexed in Elasticsearch for full-text search. The immediate focus is making the scraping infrastructure robust and the Telegram control interface reliable.

## Core Value

The scraping pipeline runs continuously and reliably, with full control via Telegram — no babysitting required.

## Requirements

### Validated

- ✓ 4-stage scraping pipeline: channel discovery → channel enrichment → video discovery → video processing — existing
- ✓ PostgreSQL-backed job queues with `FOR UPDATE SKIP LOCKED` for concurrency safety — existing
- ✓ Captions stored in PostgreSQL, synced to Elasticsearch for full-text search — existing
- ✓ Telegram bot with /start, /stop, /restart, stats, and config commands — existing
- ✓ Docker/Docker Compose deployment (app + postgres + elasticsearch + kibana) — existing
- ✓ Search channel queries seeder — existing

### Active

- [ ] Telegram bot runs as a standalone Node.js process, independent from the scraper
- [ ] Scraper runs as a standalone Node.js process, independent from the bot
- [ ] Bot-to-scraper IPC via PostgreSQL (command + status table) — no new infra required
- [ ] /start sends immediate ack, then follow-up message when scraper is actually running
- [ ] /stop sends immediate ack, then follow-up when graceful shutdown completes
- [ ] /kill sends immediate ack, then follow-up when scraper has stopped
- [ ] Crash in scraper process does not affect the bot process
- [ ] Crash in bot process does not affect the scraper process

### Out of Scope

- End-user web app (Next.js) — future milestone, not current focus
- Search API for end users — future milestone
- Multi-language support — English only for now
- Authentication/user accounts — no end users yet

## Context

**Existing codebase:** TypeScript/Node.js, InversifyJS DI, Kysely + PostgreSQL, Elasticsearch 8.12, Telegraf 4.16. Currently `TelegramBot` and `ScraperOrchestrator` live in the same process wired by the same IoC container in `src/main.ts`.

**Current coupling:** `LifecycleController` (Telegram command handler) holds a direct reference to `StartScrapersUseCase` and `StopScrapersUseCase`, which call the `ScraperOrchestrator` in-process. The orchestrator runs a `while(true)` loop that must be stopped gracefully before the process exits.

**IPC approach:** PostgreSQL already holds all pipeline state. A `scraperControl` table (desired command + timestamp) and `scraperStatus` table (actual running state + timestamp) gives the bot a way to issue commands and the scraper a way to report its state — without adding Redis or HTTP servers.

**Long-term vision:** End-user web app where users type a word and see YouTube clips playing at the matched timestamp (like YouGlish). Next.js frontend + search API over Elasticsearch. Not in scope for current milestone.

## Constraints

- **Tech stack**: TypeScript/Node.js — consistent with existing codebase
- **Infrastructure**: PostgreSQL for IPC — avoid adding Redis or other new dependencies
- **Patterns**: Result type, DI container, worker/use-case pattern — keep consistent
- **Deployment**: Docker Compose — both processes run as separate containers

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| PostgreSQL for IPC between bot and scraper | Already in the stack; no new infra; scraper already polls DB | — Pending |
| Two separate Docker containers (bot + scraper) | Process isolation is the goal; Docker Compose makes this easy | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-04-07 after initialization*
