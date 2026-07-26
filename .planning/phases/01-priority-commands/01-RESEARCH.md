# Phase 01: Priority Commands - Research

**Researched:** 2026-07-26
**Domain:** Telegram bot command implementation — TypeScript, Telegraf, Kysely ORM, Inversify DI
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** `processed` = count of `videoJobs` records with status `SUCCEEDED` for that channel
- **D-02:** `total` = count of all `videoJobs` records for that channel (PENDING + PROCESSING + SUCCEEDED + FAILED + SKIPPED)
- **D-03:** Exclude channels that have no entry in `channelPriorityScores` — only show channels with a calculated score
- **D-04:** One shared use case (`GetChannelPriorityRankingsUseCase`) with a filter parameter (`all` | `active`). Two separate controllers (`PriorityAllController`, `PriorityActiveController`), each injecting the same use case
- **D-05:** Plain compact format per entry: `{rank}. {channelName} | {score} | {processed}/{total}` — Example: `1. MrBeast | 94.2 | 312/450`. Score to 1 decimal. One entry per line joined with `\n`
- **D-06:** Command names: `/priority_all` and `/priority_active` (underscore convention)
- Priority score source: query `channelPriorityScores` table directly (pre-calculated)
- "Active" filter: `EXISTS (SELECT 1 FROM videoJobs WHERE channelId = c.id AND status = 'PENDING')`
- Limit: top 10 results, ordered by `scrapingScore DESC`

### Claude's Discretion

- File location and naming for new use case and controllers (following existing patterns)
- Whether to extract a dedicated `ChannelPriorityRankingsRepository` or embed the query in the use case directly

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| BOT-01 | User can run `/priority_all` and receive a list of the top 10 channels ranked by priority score, each entry showing rank number, channel name, priority score, and processed/total video count | Query `channelPriorityScores` JOIN `channels` with video count aggregation; PriorityAllController + shared use case |
| BOT-02 | User can run `/priority_active` and receive the same list but filtered to channels that have at least one `video_jobs` record with status `PENDING` | Same query as BOT-01 with EXISTS subquery filter; PriorityActiveController injecting same use case |
</phase_requirements>

## Summary

This phase adds two Telegram bot commands that surface priority-ranked channel data already stored in the database. The implementation is purely additive — no schema changes, no new packages, no API changes. The domain is well-defined by the existing codebase: every pattern needed (controller, use case, DI registration) already exists in `src/modules/telegram/`.

The central implementation challenge is the Kysely JOIN query that aggregates `videoJobs` counts per channel while joining `channelPriorityScores` and `channels`. The project uses Kysely 0.27.5 with `CamelCasePlugin` (column names in TypeScript are camelCase; the plugin translates to snake_case in SQL). All aggregate functions must use Kysely's expression builder syntax.

The DI container in `main-bot.ts` uses `autobind: true`, meaning any class decorated with `@injectable()` is automatically resolved — no explicit `container.bind()` calls are needed for the new classes. The `TelegramBot` constructor receives controllers via Inversify constructor injection; adding new controllers requires adding them as constructor parameters in `TelegramBot`.

**Primary recommendation:** Implement `GetChannelPriorityRankingsUseCase` in `src/modules/scraping/channel-priority/` (co-located with priority domain logic), with `PriorityAllController` and `PriorityActiveController` in `src/modules/telegram/`. Register both controllers in `TelegramBot` constructor and `registerControllers()`. No repository class needed — embed query in use case (matches `RecalculateAllPrioritiesUseCase` and `GetStatsUseCase` patterns for simple reads).

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Command registration & Telegram reply | Telegram Controller | — | All bot commands are registered in `telegram-bot.ts` via controller `register()` methods |
| Business logic / query orchestration | Use Case (`execute()`) | — | Business logic belongs in use cases per project architecture |
| Database query (priority + video counts) | Use Case (direct db access) | — | Simple read queries are embedded in use cases; repositories are for complex reusable data access |
| Message formatting | Controller | — | Controllers own presentation; they format the use case result into Telegram-ready strings |
| DI wiring | `main-bot.ts` + `TelegramBot` constructor | — | `autobind: true` handles class registration; TelegramBot constructor receives controller instances |

## Standard Stack

### Core (all already present — no new packages)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Telegraf | 4.16.3 | Telegram bot framework | Already used; `bot.command()` is the established registration API [VERIFIED: codebase] |
| Kysely | 0.27.5 | Type-safe query builder | Already used; `db.selectFrom().leftJoin().select().where().orderBy().limit()` pattern [VERIFIED: codebase] |
| inversify | 7.9.1 | Dependency injection | Already used; `@injectable()` + constructor injection is established pattern [VERIFIED: codebase] |
| TypeScript | 5.7.0 | Language | Project baseline [VERIFIED: codebase] |

### No new packages required

This phase installs zero new dependencies. All capabilities are satisfied by the existing stack.

## Package Legitimacy Audit

No new packages are installed in this phase. Audit: N/A.

**Packages removed due to SLOP verdict:** none
**Packages flagged as suspicious SUS:** none

## Architecture Patterns

### System Architecture Diagram

```
Telegram User
     |
     | /priority_all or /priority_active command
     v
TelegramBot (auth middleware checks TELEGRAM_CHAT_ID)
     |
     +---> PriorityAllController.register()
     |          |
     +---> PriorityActiveController.register()
                |
                v
     GetChannelPriorityRankingsUseCase.execute({ filter: "all" | "active" })
                |
                v
     DatabaseClient (Kysely)
         SELECT cps.scrapingScore, c.name,
                COUNT(vj) FILTER (status=SUCCEEDED) as processed,
                COUNT(vj) as total
         FROM channelPriorityScores cps
         JOIN channels c ON c.id = cps.channelId
         LEFT JOIN videoJobs vj ON vj.channelId = cps.channelId
         [WHERE EXISTS(SELECT 1 FROM videoJobs WHERE channelId=cps.channelId AND status='PENDING')]
         GROUP BY cps.channelId, cps.scrapingScore, c.name
         ORDER BY cps.scrapingScore DESC
         LIMIT 10
                |
                v
     ChannelPriorityRanking[] returned to controller
                |
                v
     Controller formats: "1. MrBeast | 94.2 | 312/450\n2. ..."
                |
                v
     ctx.reply(message)
```

### Recommended Project Structure

```
src/
├── modules/
│   ├── telegram/
│   │   ├── priority-all.controller.ts        # NEW — PriorityAllController
│   │   ├── priority-active.controller.ts     # NEW — PriorityActiveController
│   │   └── telegram-bot.ts                   # MODIFIED — add 2 new controller params
│   └── scraping/
│       └── channel-priority/
│           └── get-channel-priority-rankings.use-case.ts  # NEW
```

### Pattern 1: Controller implementing TelegramController

All bot commands follow this exact structure. New controllers must match it precisely.

```typescript
// Source: src/modules/telegram/recalculate-priority.controller.ts [VERIFIED: codebase]
import { injectable } from "inversify";
import { Telegraf } from "telegraf";
import { Logger } from "../_common/logger/logger.js";
import { TelegramController } from "./telegram-controller.js";
// import use case here

@injectable()
export class PriorityAllController implements TelegramController {
  constructor(
    private readonly logger: Logger,
    private readonly getChannelPriorityRankingsUseCase: GetChannelPriorityRankingsUseCase,
  ) {
    this.logger.setContext(PriorityAllController.name);
  }

  public register(bot: Telegraf): void {
    bot.command("priority_all", async (ctx) => {
      this.logger.info("Received /priority_all command");
      const result = await this.getChannelPriorityRankingsUseCase.execute({ filter: "all" });
      if (!result.ok) {
        await ctx.reply("Failed to load priority rankings.");
        return;
      }
      if (result.value.length === 0) {
        await ctx.reply("No channels with priority scores found.");
        return;
      }
      const lines = result.value.map(
        (entry, i) =>
          `${i + 1}. ${entry.channelName} | ${entry.scrapingScore.toFixed(1)} | ${entry.processed}/${entry.total}`,
      );
      await ctx.reply(lines.join("\n"));
    });
  }
}
```

### Pattern 2: Use Case with direct db access (simple read, no repository)

For simple query-and-return use cases, the codebase embeds the query directly in the use case. See `RecalculateAllPrioritiesUseCase` (queries `channels` directly) and `GetStatsUseCase` (queries multiple tables via `StatsRepository`). For a single aggregation query, embedding is appropriate.

```typescript
// Source: pattern derived from src/modules/scraping/channel-priority/recalculate-all-priorities.use-case.ts [VERIFIED: codebase]
import { injectable } from "inversify";
import { DatabaseClient } from "../../../db/client.js";
import { DatabaseError } from "../../../db/types.js";
import { Failure, Result, Success } from "../../../types/index.js";
import { tryCatch } from "../../_common/try-catch.js";

export type ChannelPriorityRanking = {
  channelName: string;
  scrapingScore: number;
  processed: number;
  total: number;
};

export type GetChannelPriorityRankingsFilter = "all" | "active";

@injectable()
export class GetChannelPriorityRankingsUseCase {
  constructor(private readonly db: DatabaseClient) {}

  async execute(params: {
    filter: GetChannelPriorityRankingsFilter;
  }): Promise<Result<ChannelPriorityRanking[], DatabaseError>> {
    const result = await tryCatch(this.query(params.filter));
    if (!result.ok) {
      return Failure({ type: "DATABASE", error: result.error });
    }
    return Success(result.value);
  }

  private async query(
    filter: GetChannelPriorityRankingsFilter,
  ): Promise<ChannelPriorityRanking[]> {
    // See query construction section in Code Examples below
  }
}
```

### Pattern 3: Registering controllers in TelegramBot

Adding a controller requires two changes to `telegram-bot.ts`:

1. Import the new controller class
2. Add it as a constructor parameter (Inversify injects it automatically via `autobind: true`)
3. Call `controller.register(this.bot)` inside `registerControllers()`
4. Add the command to `syncCommands()` for the Telegram UI command list

```typescript
// Source: src/modules/telegram/telegram-bot.ts [VERIFIED: codebase]
// Constructor parameter addition (matches existing pattern):
constructor(
  private readonly logger: Logger,
  // ... existing controllers ...
  private readonly recalculatePriorityController: RecalculatePriorityController,
  private readonly priorityAllController: PriorityAllController,       // ADD
  private readonly priorityActiveController: PriorityActiveController, // ADD
) { ... }

// registerControllers() addition:
private registerControllers(): void {
  // ... existing registrations ...
  this.recalculatePriorityController.register(this.bot);
  this.priorityAllController.register(this.bot);       // ADD
  this.priorityActiveController.register(this.bot);    // ADD
}

// syncCommands() addition:
{ command: "priority_all", description: "Show top 10 channels by priority" },
{ command: "priority_active", description: "Show top 10 active channels by priority" },
```

### Anti-Patterns to Avoid

- **Calling `container.bind()` explicitly in `main-bot.ts`:** Not needed. `autobind: true` handles `@injectable()` classes automatically. Existing code only explicitly binds `Logger` and `HttpClient` (non-standard constructors). [VERIFIED: codebase — `src/main-bot.ts`]
- **Returning raw DB row types from the use case:** Define a clean `ChannelPriorityRanking` type in the use case file; don't expose Kysely/database types to controllers.
- **Using `.toFixed()` in the use case:** Score formatting is presentation concern. Do it in the controller, not the use case.
- **Aggregating with JavaScript after fetching all rows:** Use Kysely's `fn.count().filterWhere()` in the SQL query. Fetching all `videoJobs` rows and counting in JS would be O(N) network and memory overhead.
- **Using `interface` keyword:** Project uses `type` keyword for all type aliases per CLAUDE.md conventions.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Count of SUCCEEDED videoJobs per channel | Loop over all jobs in JS | `eb.fn.count().filterWhere()` in Kysely | SQL aggregate is atomic, no N+1 queries |
| Active channel detection | Fetch all PENDING jobs, deduplicate channelIds | `EXISTS` subquery via Kysely `.where(eb => eb.exists(...))` | Single SQL pass, correct semantics |
| DI wiring | Calling `container.get()` or `container.bind()` | `@injectable()` + constructor parameter in `TelegramBot` | `autobind: true` handles everything automatically |
| Error-safe DB calls | try/catch in use case body | `tryCatch()` from `src/modules/_common/try-catch.ts` | Consistent `Result<T, E>` return type, matches all other use cases |

**Key insight:** Every pattern needed is already in the codebase. The only "new" code is wiring the query and formatting logic into the established controller/use-case skeleton.

## Code Examples

### Kysely Aggregation Query (priority rankings)

The query must join three tables and aggregate two counts per channel using conditional count. The `CamelCasePlugin` means TypeScript uses camelCase names; Kysely translates to snake_case in SQL.

```typescript
// Source: pattern derived from src/modules/scraping/channel-priority/channel-priority.service.ts [VERIFIED: codebase]
// and src/modules/scraping/stats/stats.repository.ts [VERIFIED: codebase]

private async query(filter: GetChannelPriorityRankingsFilter) {
  let query = this.db
    .selectFrom("channelPriorityScores as cps")
    .innerJoin("channels as c", "c.id", "cps.channelId")
    .leftJoin("videoJobs as vj", "vj.channelId", "cps.channelId")
    .select([
      "c.name as channelName",
      "cps.scrapingScore",
      (eb) =>
        eb.fn
          .count<string>("vj.id")
          .filterWhere("vj.status", "=", "SUCCEEDED")
          .as("processed"),
      (eb) =>
        eb.fn
          .count<string>("vj.id")
          .as("total"),
    ])
    .groupBy(["cps.channelId", "cps.scrapingScore", "c.name"])
    .orderBy("cps.scrapingScore", "desc")
    .limit(10);

  if (filter === "active") {
    query = query.where((eb) =>
      eb.exists(
        eb
          .selectFrom("videoJobs")
          .select("videoJobs.id")
          .whereRef("videoJobs.channelId", "=", "cps.channelId")
          .where("videoJobs.status", "=", "PENDING"),
      ),
    );
  }

  const rows = await query.execute();
  return rows.map((row) => ({
    channelName: row.channelName,
    scrapingScore: Number(row.scrapingScore),
    processed: Number(row.processed),
    total: Number(row.total),
  }));
}
```

**Important:** Kysely returns aggregate counts as strings from PostgreSQL — must cast with `Number()`. This is the same pattern used in `stats.repository.ts` (`Number(row.count)`). [VERIFIED: codebase]

### The `fn.count().filterWhere()` pattern

```typescript
// Source: src/modules/scraping/channel-priority/channel-priority.service.ts lines 86-96 [VERIFIED: codebase]
// Used for counting SUCCEEDED videoJobs per channel in the priority score calculation.
// The same pattern applies here for the processed/total counts.
eb.fn
  .count<string>("videoJobs.id")
  .filterWhere("videoJobs.status", "=", "SUCCEEDED")
  .as("totalProcessedCount")
```

### Logger setup in controller constructor

```typescript
// Source: src/modules/telegram/recalculate-priority.controller.ts [VERIFIED: codebase]
constructor(
  private readonly logger: Logger,
  private readonly someUseCase: SomeUseCase,
) {
  this.logger.setContext(ClassName.name);  // must be called in constructor
}
```

## Common Pitfalls

### Pitfall 1: Kysely table alias in EXISTS subquery loses type safety

**What goes wrong:** When using `eb.exists(eb.selectFrom("videoJobs")...)`, the `whereRef` must reference the outer alias (`"cps.channelId"`). If you use the full alias incorrectly, Kysely may not resolve the column reference.

**Why it happens:** Kysely's type system tracks aliases; mismatched alias names cause runtime SQL errors, not compile-time errors.

**How to avoid:** Use `whereRef("videoJobs.channelId", "=", "cps.channelId")` to correlate the subquery to the outer query's alias. Test with actual data.

**Warning signs:** PostgreSQL error "column cps.channel_id does not exist" at runtime.

### Pitfall 2: Forgetting `groupBy` includes all selected non-aggregate columns

**What goes wrong:** PostgreSQL requires all non-aggregate SELECT columns to appear in GROUP BY. If `cps.scrapingScore` or `c.name` is selected but not grouped, the query throws.

**Why it happens:** Kysely doesn't enforce GROUP BY at the type level for all cases.

**How to avoid:** Group by `["cps.channelId", "cps.scrapingScore", "c.name"]` — all three selected non-aggregate columns.

**Warning signs:** `ERROR: column "cps.scraping_score" must appear in the GROUP BY clause`.

### Pitfall 3: Controller not registered in `registerControllers()` but constructor added

**What goes wrong:** Adding the controller to the constructor but forgetting to call `controller.register(this.bot)` means the command is never bound. The bot starts without error, but the command does nothing.

**Why it happens:** `registerControllers()` is a separate private method; easy to miss when adding a constructor parameter.

**How to avoid:** Always update both the constructor parameters AND `registerControllers()` in the same edit.

### Pitfall 4: `autobind: true` does not apply to `TelegramBot`'s constructor dependencies

**What goes wrong:** Thinking `autobind: true` means zero wiring needed. Actually, `TelegramBot` is explicitly bound with `.toSelf().inSingletonScope()`. The controllers are auto-resolved as constructor dependencies of `TelegramBot` — but they MUST be in the constructor for Inversify to inject them.

**Why it happens:** Inversify resolves constructor parameters automatically when `autobind: true` is set, but only for classes that are requested from the container. The controllers are never directly requested — they're only resolved as `TelegramBot` dependencies.

**How to avoid:** Add new controllers as constructor parameters in `TelegramBot`. No changes needed in `main-bot.ts`. [VERIFIED: codebase — `src/main-bot.ts`]

### Pitfall 5: Command name format in `syncCommands()` omits prefix slash

**What goes wrong:** `syncCommands()` uses the command name without the leading `/`. Using `"priority_all"` (correct) vs `"/priority_all"` (wrong) in `setMyCommands`.

**Why it happens:** Telegram's `setMyCommands` API takes names without the slash; Telegraf's `bot.command()` also takes names without the slash.

**How to avoid:** Match the existing entries in `syncCommands()` — all use bare names like `"recalculate_priority"`. [VERIFIED: codebase — `src/modules/telegram/telegram-bot.ts` line 104]

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| N/A — greenfield addition | Follows established controller/use-case/DI pattern | Existing | No migration needed |

**Deprecated/outdated:**
- Nothing — this phase only adds new files.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `autobind: true` auto-resolves `@injectable()` classes as constructor dependencies without explicit `container.bind()` | Architecture Patterns | If wrong, need explicit binds in `main-bot.ts` — low risk, easy to fix |
| A2 | Kysely's `fn.count().filterWhere()` works correctly with LEFT JOIN (counts 0 for channels with no jobs) | Code Examples | If wrong, channels with no videoJobs might error or return null; need COALESCE |

**Note:** Both assumptions are LOW risk. A1 is effectively verified by the existing codebase (`main-bot.ts` does not bind any controller classes explicitly, yet they resolve). A2 is a standard SQL behavior — LEFT JOIN + COUNT returns 0 for no matches.

## Open Questions

1. **Score type precision**
   - What we know: `scrapingScore` is typed as `number` in `ChannelPriorityScoresRow`
   - What's unclear: Whether PostgreSQL returns it as integer or float; Kysely's `CamelCasePlugin` does not affect numeric types
   - Recommendation: Cast with `Number()` and call `.toFixed(1)` in the controller — handles both cases

2. **Empty state message**
   - What we know: D-03 excludes unscored channels; no message text was specified for the empty-result case
   - What's unclear: Exact wording for "no results found" reply
   - Recommendation: Use `"No channels with priority scores found."` for `/priority_all` and `"No active channels with priority scores found."` for `/priority_active` — follows existing terse message style

## Environment Availability

Step 2.6: SKIPPED — this phase makes no external tool calls. All dependencies (PostgreSQL, Telegraf, Kysely, Inversify) are already wired in the running bot process. No new CLI tools, runtimes, or services required.

## Validation Architecture

`workflow.nyquist_validation` is explicitly `false` in `.planning/config.json`. Validation Architecture section skipped per configuration.

## Security Domain

`security_enforcement` is `true` in `.planning/config.json` with `security_asvs_level: 1`.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | N/A — commands are Telegram messages, auth handled by existing chat ID whitelist middleware |
| V3 Session Management | No | No session state in bot commands |
| V4 Access Control | Yes | Existing `TelegramBot.setupAuthMiddleware()` enforces `TELEGRAM_CHAT_ID` whitelist — no changes needed, new commands inherit middleware automatically |
| V5 Input Validation | No | These commands take no user input — they are zero-argument commands |
| V6 Cryptography | No | No crypto operations |

### Known Threat Patterns for Telegraf bot commands

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Unauthorized command execution | Elevation of privilege | Already mitigated by `setupAuthMiddleware()` — all incoming messages are filtered by chat ID before reaching command handlers [VERIFIED: codebase] |
| SQL injection via channelId/filter | Tampering | Not applicable — filter is a TypeScript literal type (`"all" \| "active"`), not user input. No untrusted data reaches DB queries |

**Security note:** No new attack surface is introduced. The two new commands are read-only queries; they expose priority ranking data only to the authorized Telegram chat.

## Sources

### Primary (HIGH confidence)
- `src/modules/telegram/telegram-bot.ts` — controller registration pattern, constructor injection pattern, syncCommands structure [VERIFIED: codebase]
- `src/modules/telegram/recalculate-priority.controller.ts` — canonical controller skeleton [VERIFIED: codebase]
- `src/modules/telegram/stats.controller.ts` — multi-line message formatting pattern [VERIFIED: codebase]
- `src/modules/scraping/channel-priority/channel-priority.service.ts` — `fn.count().filterWhere()` pattern, Kysely join syntax [VERIFIED: codebase]
- `src/modules/scraping/stats/stats.repository.ts` — `Number(row.count)` cast pattern, tryCatch usage [VERIFIED: codebase]
- `src/db/types.ts` — `ChannelPriorityScoresRow`, `VideoJobsRow`, `ChannelsRow` schema [VERIFIED: codebase]
- `src/main-bot.ts` — `autobind: true` container, no explicit controller binds needed [VERIFIED: codebase]
- `.planning/config.json` — `nyquist_validation: false`, `security_enforcement: true` [VERIFIED: codebase]

### Secondary (MEDIUM confidence)
- None — all research was codebase-grounded.

### Tertiary (LOW confidence)
- None.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries already in use, versions confirmed from `package.json`/codebase
- Architecture: HIGH — every pattern verified from existing controller/use-case code
- Query construction: HIGH — `fn.count().filterWhere()` and EXISTS patterns verified from `channel-priority.service.ts`
- Pitfalls: HIGH — derived from actual code analysis (groupBy requirements, alias references)

**Research date:** 2026-07-26
**Valid until:** Stable — no external dependencies; valid until codebase architecture changes
