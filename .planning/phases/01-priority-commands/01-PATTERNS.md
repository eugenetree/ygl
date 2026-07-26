# Phase 01: Priority Commands - Pattern Map

**Mapped:** 2026-07-26
**Files analyzed:** 4 (2 new controllers, 1 new use case, 1 modified bot)
**Analogs found:** 4 / 4

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/modules/telegram/priority-all.controller.ts` | controller | request-response | `src/modules/telegram/recalculate-priority.controller.ts` | exact |
| `src/modules/telegram/priority-active.controller.ts` | controller | request-response | `src/modules/telegram/recalculate-priority.controller.ts` | exact |
| `src/modules/scraping/channel-priority/get-channel-priority-rankings.use-case.ts` | use case | CRUD (read) | `src/modules/scraping/channel-priority/recalculate-all-priorities.use-case.ts` | role-match |
| `src/modules/telegram/telegram-bot.ts` | controller registry | request-response | self (modification) | exact |

## Pattern Assignments

### `src/modules/telegram/priority-all.controller.ts` (controller, request-response)

**Analog:** `src/modules/telegram/recalculate-priority.controller.ts`

**Imports pattern** (lines 1-5):
```typescript
import { injectable } from "inversify";
import { Telegraf } from "telegraf";
import { Logger } from "../_common/logger/logger.js";
import { GetChannelPriorityRankingsUseCase } from "../scraping/channel-priority/get-channel-priority-rankings.use-case.js";
import { TelegramController } from "./telegram-controller.js";
```

**Core controller pattern** (lines 7-28, full file):
```typescript
@injectable()
export class RecalculatePriorityController implements TelegramController {
  constructor(
    private readonly logger: Logger,
    private readonly recalculateAllPrioritiesUseCase: RecalculateAllPrioritiesUseCase,
  ) {
    this.logger.setContext(RecalculatePriorityController.name);
  }

  public register(bot: Telegraf): void {
    bot.command("recalculate_priority", async (ctx) => {
      this.logger.info("Received /recalculate_priority command");
      // ... handler body
    });
  }
}
```

**Multi-line reply pattern** — from `src/modules/telegram/stats.controller.ts` (lines 34-41):
```typescript
const message =
  `Scraper state: ${scrapingStatus}\n\n` +
  `${this.formatLine("Channel Discovery", stats.channelDiscovery)}\n\n`;
await ctx.reply(message);
```

**For priority commands specifically** — build lines array and join:
```typescript
const lines = result.value.map(
  (entry, i) =>
    `${i + 1}. ${entry.channelName} | ${entry.scrapingScore.toFixed(1)} | ${entry.processed}/${entry.total}`,
);
await ctx.reply(lines.join("\n"));
```

**Error + empty-state guard pattern** (from RESEARCH.md Pattern 1):
```typescript
if (!result.ok) {
  await ctx.reply("Failed to load priority rankings.");
  return;
}
if (result.value.length === 0) {
  await ctx.reply("No channels with priority scores found.");
  return;
}
```

---

### `src/modules/telegram/priority-active.controller.ts` (controller, request-response)

**Analog:** `src/modules/telegram/recalculate-priority.controller.ts`

Identical structure to `priority-all.controller.ts`. Only differences:
- Class name: `PriorityActiveController`
- Command name: `"priority_active"`
- Use case call: `execute({ filter: "active" })`
- Empty-state message: `"No active channels with priority scores found."`

All imports, decorator, constructor, and register skeleton are identical — copy directly from the `priority-all` controller, change the three values above.

---

### `src/modules/scraping/channel-priority/get-channel-priority-rankings.use-case.ts` (use case, CRUD read)

**Analog:** `src/modules/scraping/channel-priority/recalculate-all-priorities.use-case.ts`

**Imports pattern** (lines 1-6 of analog, adapted):
```typescript
import { injectable } from "inversify";
import { DatabaseClient } from "../../../db/client.js";
import { DatabaseError } from "../../../db/types.js";
import { Failure, type Result, Success } from "../../../types/index.js";
import { tryCatch } from "../../_common/try-catch.js";
```

**Type definitions** — define above the class (no `interface` keyword per CLAUDE.md):
```typescript
export type ChannelPriorityRanking = {
  channelName: string;
  scrapingScore: number;
  processed: number;
  total: number;
};

export type GetChannelPriorityRankingsFilter = "all" | "active";
```

**Class skeleton** — from `recalculate-all-priorities.use-case.ts` (lines 11-42):
```typescript
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

  private async query(filter: GetChannelPriorityRankingsFilter): Promise<ChannelPriorityRanking[]> {
    // see Kysely query pattern below
  }
}
```

**Kysely aggregation query** — from `src/modules/scraping/stats/stats.repository.ts` (countAll pattern, lines 78-81) and `src/modules/scraping/channel-priority/channel-priority.service.ts` (filterWhere pattern):
```typescript
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
      (eb) => eb.fn.count<string>("vj.id").as("total"),
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

**`Number()` cast is mandatory** — PostgreSQL returns aggregate counts as strings; see `stats.repository.ts` line 49: `counts[row.status as TStatus] = Number(row.count)` and line 151: `Number(validManualCaptionsResult.value.count)`.

---

### `src/modules/telegram/telegram-bot.ts` (modification)

**Analog:** self

**Import additions** (after line 11, before `@injectable()`):
```typescript
import { PriorityAllController } from "./priority-all.controller.js";
import { PriorityActiveController } from "./priority-active.controller.js";
```

**Constructor parameter additions** (after line 31 `recalculatePriorityController`):
```typescript
private readonly priorityAllController: PriorityAllController,
private readonly priorityActiveController: PriorityActiveController,
```

**`registerControllers()` additions** (after line 78 `recalculatePriorityController.register`):
```typescript
this.priorityAllController.register(this.bot);
this.priorityActiveController.register(this.bot);
```

**`syncCommands()` additions** (after line 103 `recalculate_priority` entry):
```typescript
{ command: "priority_all", description: "Show top 10 channels by priority" },
{ command: "priority_active", description: "Show top 10 active channels by priority" },
```

Note: command names in `setMyCommands` use bare names without leading `/` — see existing entries at lines 83-103.

---

## Shared Patterns

### `@injectable()` + Logger constructor setup
**Source:** `src/modules/telegram/recalculate-priority.controller.ts` lines 7-14
**Apply to:** Both new controller files
```typescript
@injectable()
export class ClassName implements TelegramController {
  constructor(
    private readonly logger: Logger,
    private readonly someUseCase: SomeUseCase,
  ) {
    this.logger.setContext(ClassName.name);
  }
```

### Result type error handling (`tryCatch` + `Failure` + `Success`)
**Source:** `src/modules/scraping/channel-priority/channel-priority.service.ts` lines 23-28
**Apply to:** `GetChannelPriorityRankingsUseCase.execute()`
```typescript
const result = await tryCatch(this.someAsyncOperation());
if (!result.ok) {
  return Failure({ type: "DATABASE", error: result.error });
}
return Success(result.value);
```

### `DatabaseError` type usage
**Source:** `src/modules/scraping/channel-priority/channel-priority.service.ts` line 4
**Apply to:** Use case return type
```typescript
import { DatabaseError } from "../../../db/types.js";
// Return type: Promise<Result<ChannelPriorityRanking[], DatabaseError>>
// Error construction: Failure({ type: "DATABASE", error: result.error })
```

### Controller result guard before formatting
**Source:** `src/modules/telegram/stats.controller.ts` lines 24-31
**Apply to:** Both new controllers — check `!result.ok` then check `.length === 0` before building message
```typescript
if (!result.ok) {
  await ctx.reply("...");
  return;
}
if (result.value.length === 0) {
  await ctx.reply("...");
  return;
}
```

## No Analog Found

All files have strong analogs in the codebase. No greenfield patterns required.

## Metadata

**Analog search scope:** `src/modules/telegram/`, `src/modules/scraping/channel-priority/`, `src/modules/scraping/stats/`
**Files scanned:** 6
**Pattern extraction date:** 2026-07-26
