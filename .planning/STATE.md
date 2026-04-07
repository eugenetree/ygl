# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-08)

**Core value:** The scraping pipeline and Telegram bot run as independent processes — a crash in one does not affect the other.
**Current focus:** Phase 1 — DB Schema + Infrastructure

## Milestone 1 Progress

| Phase | Status | Plans |
|-------|--------|-------|
| 1. DB Schema + Infrastructure | Not started | 0/2 |
| 2. Scraper Process | Not started | 0/2 |
| 3. Bot Process | Not started | 0/2 |
| 4. Docker Split | Not started | 0/2 |

## Key Decisions Locked

- IPC via PostgreSQL `scraper_control` table (single row, desired/actual state)
- `ScraperProcess` class on bot side (concrete, DB queries inside, not a repository)
- `ScraperControlRepository` on scraper side (writes `actual_state` + `heartbeat_at`)
- `ScraperConfigRepository` stays as-is (domain model of operations subdomain)
- Scraper always auto-starts on container boot — no `desired_state` check for startup
- Orchestrator idles (sleep + retry) when queue empty — never self-stops
- Bot runs persistent background watcher for all state change notifications

## Next Step

Run `/gsd-plan-phase 1` to plan Phase 1.
