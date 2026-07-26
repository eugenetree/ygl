# Requirements: YGL — Priority Bot Commands

**Defined:** 2026-07-26
**Core Value:** Operators can monitor and control the scraping pipeline through Telegram — the bot is the primary operational window into system state.

## v1 Requirements

### Bot Commands

- [ ] **BOT-01**: User can run `/priority-all` and receive a list of the top 10 channels ranked by priority score, each entry showing rank number, channel name, priority score, and processed/total video count
- [ ] **BOT-02**: User can run `/priority-active` and receive the same list but filtered to channels that have at least one `video_jobs` record with status `PENDING`

## v2 Requirements

(None identified)

## Out of Scope

| Feature | Reason |
|---------|--------|
| Pagination beyond top 10 | Not requested |
| Sorting by fields other than priority | Not requested |
| Real-time refresh / polling | Not requested |
| Frontend/Next.js changes | Bot-only feature |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| BOT-01 | Phase 1 | Pending |
| BOT-02 | Phase 1 | Pending |

**Coverage:**
- v1 requirements: 2 total
- Mapped to phases: 2
- Unmapped: 0 ✓

---
*Requirements defined: 2026-07-26*
*Last updated: 2026-07-26 after initial definition*
