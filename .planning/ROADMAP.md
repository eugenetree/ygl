# Roadmap: YGL — Priority Bot Commands

## Overview

Two new Telegram bot commands give operators a ranked view of channel priorities. Both commands share the same query and display logic — they are implemented together as a single coherent capability.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Priority Commands** - Add `/priority-all` and `/priority-active` bot commands

## Phase Details

### Phase 1: Priority Commands
**Goal**: Operators can query channel priority rankings directly from Telegram
**Mode:** mvp
**Depends on**: Nothing (first phase)
**Requirements**: BOT-01, BOT-02
**Success Criteria** (what must be TRUE):
  1. Operator runs `/priority-all` and receives a formatted list of the top 10 channels ranked by priority score, each entry showing rank, channel name, priority score, and processed/total video count
  2. Operator runs `/priority-active` and receives the same ranked list filtered to only channels that have at least one `video_jobs` record with status `PENDING`
  3. Both commands follow the existing controller pattern in `src/modules/telegram/` and are registered in `telegram-bot.ts`
**Plans**: 1 plan
- [ ] 01-01-PLAN.md — Shared priority-rankings use case + `/priority_all` and `/priority_active` controllers, wired and advertised in telegram-bot.ts

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Priority Commands | 0/1 | Not started | - |
