# Phase 1: Priority Commands - Context

**Gathered:** 2026-07-26
**Status:** Ready for planning

<domain>
## Phase Boundary

Two Telegram bot commands that give operators a ranked view of channel scraping priority:
- `/priority_all` — top 10 channels ordered by `scrapingScore` descending, regardless of job state
- `/priority_active` — same ranked list filtered to channels that have at least one `videoJobs` record with status `PENDING`

Deliverable is bot-only. No frontend, no API, no schema changes.

</domain>

<decisions>
## Implementation Decisions

### Video Count Stats (processed/total)
- **D-01:** `processed` = count of `videoJobs` records with status `SUCCEEDED` for that channel
- **D-02:** `total` = count of all `videoJobs` records for that channel (PENDING + PROCESSING + SUCCEEDED + FAILED + SKIPPED)

### Channel Inclusion
- **D-03:** Exclude channels that have no entry in `channelPriorityScores` — only show channels with a calculated score. An unscored channel appearing with 0 would be misleading.

### Use Case Structure
- **D-04:** One shared use case (`GetChannelPriorityRankingsUseCase`) with a filter parameter (`all` | `active`). Two separate controllers (`PriorityAllController`, `PriorityActiveController`), each injecting the same use case. Avoids query duplication while keeping controller responsibilities distinct.

### Message Format
- **D-05:** Plain compact format per entry: `{rank}. {channelName} | {score} | {processed}/{total}`
  - Example: `1. MrBeast | 94.2 | 312/450`
  - Score formatted to 1 decimal place
  - One entry per line, entries joined with `\n`
- **D-06:** Command names use underscores (Telegram convention, matching existing `recalculate_priority`): `/priority_all` and `/priority_active`

### Claude's Discretion
- Priority score source: query `channelPriorityScores` table directly (pre-calculated) — no on-demand recalculation
- "Active" filter definition: `EXISTS (SELECT 1 FROM videoJobs WHERE channelId = c.id AND status = 'PENDING')` — matches the locked decision in PROJECT.md Key Decisions
- Limit: top 10 results, ordered by `scrapingScore DESC`

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements
- `.planning/REQUIREMENTS.md` — BOT-01, BOT-02 requirements
- `.planning/PROJECT.md` — Key Decisions table (active filter definition locked)

### Existing Controller Pattern
- `src/modules/telegram/recalculate-priority.controller.ts` — closest analog: priority-related controller calling a use case
- `src/modules/telegram/stats.controller.ts` — multi-line message formatting pattern
- `src/modules/telegram/telegram-controller.ts` — TelegramController interface all controllers implement
- `src/modules/telegram/telegram-bot.ts` — where controllers are registered (must add new controllers here)

### Data Sources
- `src/db/types.ts` — `ChannelPriorityScoresRow`, `VideoJobsRow`, `ChannelsRow` schema
- `src/modules/scraping/channel-priority/channel-priority.service.ts` — existing priority service (for reference, not reused directly)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `TelegramController` interface (`src/modules/telegram/telegram-controller.ts`): all controllers implement `register(bot: Telegraf): void`
- `Logger` injection pattern: `constructor(private readonly logger: Logger, ...)` + `this.logger.setContext(ClassName.name)` in constructor
- `tryCatch` utility (`src/modules/_common/try-catch.ts`): wraps async DB calls into `Result<T, E>`

### Established Patterns
- `@injectable()` class implementing `TelegramController`
- `register(bot)` method calls `bot.command("name", async (ctx) => { ... })`
- Controller injects a use case; use case holds the query logic
- Use case `execute()` returns a plain value (not wrapped in Result for simple reads — see `GetStatsUseCase`)
- Multi-line Telegram messages built via string concatenation with `\n`

### Integration Points
- `telegram-bot.ts` instantiates and registers controllers — new controllers must be bound in the IoC container and registered here
- `channelPriorityScores` table joined with `channels` (for name) and `videoJobs` (for processed/total counts) — all accessible via `DatabaseClient`

</code_context>

<specifics>
## Specific Ideas

- No specific visual references — user confirmed plain compact format (`1. Name | score | X/Y`)

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 1-Priority Commands*
*Context gathered: 2026-07-26*
