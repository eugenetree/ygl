# YGL — YouTube Channel Caption Scraper

## What This Is

A YouTube caption scraping system that discovers channels, fetches video metadata and captions, indexes them in Elasticsearch, and exposes a search API. A Telegram bot serves as the control interface for operators to manage and monitor the scraper pipeline.

## Core Value

Operators can monitor and control the scraping pipeline through Telegram — the bot is the primary operational window into system state.

## Requirements

### Validated

- ✓ Channel scraping pipeline (discovery → channel info → video listing → caption extraction) — existing
- ✓ Caption search via Elasticsearch API (`GET /api/search`) — existing
- ✓ Telegram bot lifecycle control (start/stop scraper) — existing
- ✓ Telegram bot stats and status reporting — existing
- ✓ Priority calculation for channels (age, view count, subscriber count) — existing
- ✓ Priority recalculation command (`/recalculate-priority`) — existing
- ✓ Multi-instance scraper support (scraper-us, scraper-gb) — existing

### Active

- [ ] `/priority-all` command: show top 10 channels by priority, each entry showing rank, channel name, priority score, and processed/total video count
- [ ] `/priority-active` command: same as above but filtered to channels where at least one `video_jobs` record is in `PENDING` status

### Out of Scope

- Pagination beyond top 10 — not requested
- Sorting by any field other than priority — not requested
- Frontend/Next.js changes — bot-only feature

## Context

The Telegram module follows the controller pattern: each command has a dedicated `*Controller` class registered in `telegram-bot.ts`. Priority data already flows through `ChannelPriorityCalculator` (which scores channels by age, view count, and subscriber count). Video job state is tracked in a `video_jobs` table with a `status` field; `PENDING` means the video hasn't been fully processed yet.

## Constraints

- **Pattern**: New commands must follow the existing controller pattern in `src/modules/telegram/`
- **Stack**: TypeScript, Kysely ORM, Inversify DI, Telegraf bot framework

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Filter "active" by PENDING video_jobs | User's explicit definition of "has videos to process" | — Pending |

---
*Last updated: 2026-07-26 after initialization*

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
