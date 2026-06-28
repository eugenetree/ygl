# Priority Channels Commands Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `/priority_all` and `/priority_active` Telegram bot commands that show the top 10 channels ranked by scraping priority score, with `/priority_active` filtering to channels that still have pending/processing video jobs.

**Architecture:** A single `PriorityController` (following the `LifecycleController` pattern) handles both commands and delegates to `GetTopChannelsByPriorityUseCase`, which delegates to a new `getTopChannels({ activeOnly })` method on `ChannelPriorityService`. The query joins `channels`, `channelPriorityScores`, and aggregates `videoJobs` in one go.

**Tech Stack:** TypeScript, Telegraf, Kysely 0.27.x ORM, InversifyJS with `autobind: true` (no manual bindings needed — `@injectable()` is sufficient).

## Global Constraints

- No new DB tables or migrations
- All new classes must be decorated with `@injectable()` from `inversify`
- Test framework: `node:test` with `node:assert/strict` and `pg-mem` in-memory Postgres
- Run tests with: `node --test --import tsx "src/**/*.test.ts"`
- Telegram commands use underscores: `priority_all`, `priority_active`

---

### Task 1: Add `getTopChannels` to `ChannelPriorityService` with tests

**Files:**
- Modify: `src/modules/scraping/channel-priority/channel-priority.service.ts`
- Create: `src/modules/scraping/channel-priority/channel-priority.service.test.ts`

**Interfaces:**
- Produces: `TopChannel` type and `getTopChannels({ activeOnly: boolean })` method on `ChannelPriorityService`
  ```ts
  export type TopChannel = {
    id: string;
    name: string;
    scrapingScore: number;
    subscriberCount: number | null;
    processedCount: number;
    totalCount: number;
  };
  ```

---

- [ ] **Step 1: Write the failing test**

Create `src/modules/scraping/channel-priority/channel-priority.service.test.ts`:

```typescript
import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { CamelCasePlugin, Kysely, PostgresDialect, sql } from "kysely";
import { DataType, newDb } from "pg-mem";
import { DatabaseClient } from "../../../db/client.js";
import { Database } from "../../../db/types.js";
import { ChannelPriorityCalculator } from "./channel-priority.calculator.js";
import { ChannelPriorityService } from "./channel-priority.service.js";

async function createTestDb() {
  const mem = newDb();
  mem.public.registerFunction({
    name: "gen_random_uuid",
    returns: DataType.uuid,
    implementation: () => crypto.randomUUID(),
  });

  const { Pool } = mem.adapters.createPg();
  const pool = new Pool();

  const db = new Kysely<Database>({
    dialect: new PostgresDialect({ pool }),
    plugins: [new CamelCasePlugin()],
  });

  await db.schema
    .createTable("channels")
    .addColumn("id", "varchar", (c) => c.primaryKey())
    .addColumn("name", "varchar", (c) => c.notNull())
    .addColumn("subscriberCount", "integer")
    .execute();

  await db.schema
    .createTable("channelPriorityScores")
    .addColumn("channelId", "varchar", (c) => c.primaryKey())
    .addColumn("scrapingScore", "double precision", (c) => c.notNull())
    .addColumn("searchScore", "double precision", (c) => c.notNull())
    .addColumn("components", "jsonb", (c) => c.notNull())
    .addColumn("calculatedAt", "timestamp")
    .execute();

  await db.schema
    .createTable("videoJobs")
    .addColumn("id", "uuid", (c) =>
      c.primaryKey().defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn("videoId", "varchar", (c) => c.notNull())
    .addColumn("channelId", "varchar", (c) => c.notNull())
    .addColumn("status", "varchar", (c) => c.notNull())
    .addColumn("skipCause", "varchar")
    .addColumn("statusUpdatedAt", "timestamp")
    .addColumn("priority", "double precision", (c) => c.notNull().defaultTo(0))
    .addColumn("createdAt", "timestamp", (c) =>
      c.notNull().defaultTo(sql`now()`),
    )
    .execute();

  // boostedChannels needed by ChannelPriorityService constructor dependency
  await db.schema
    .createTable("boostedChannels")
    .addColumn("channelId", "varchar", (c) => c.primaryKey())
    .addColumn("createdAt", "timestamp", (c) =>
      c.notNull().defaultTo(sql`now()`),
    )
    .execute();

  return db;
}

function buildSut(db: Kysely<Database>) {
  return new ChannelPriorityService(
    db as unknown as DatabaseClient,
    new ChannelPriorityCalculator(),
  );
}

async function seedChannel(
  db: Kysely<Database>,
  id: string,
  name: string,
  subscriberCount: number | null = null,
) {
  await db
    .insertInto("channels")
    .values({ id, name, subscriberCount })
    .execute();
}

async function seedPriorityScore(
  db: Kysely<Database>,
  channelId: string,
  scrapingScore: number,
) {
  await db
    .insertInto("channelPriorityScores")
    .values({
      channelId,
      scrapingScore,
      searchScore: 0,
      components: JSON.stringify({}) as unknown as Record<string, unknown>,
      calculatedAt: new Date(),
    })
    .execute();
}

async function seedVideoJob(
  db: Kysely<Database>,
  channelId: string,
  videoId: string,
  status: "PENDING" | "PROCESSING" | "SUCCEEDED" | "FAILED",
) {
  await db
    .insertInto("videoJobs")
    .values({
      id: crypto.randomUUID(),
      channelId,
      videoId,
      status,
      priority: 0,
      statusUpdatedAt: new Date(),
    })
    .execute();
}

describe("ChannelPriorityService.getTopChannels", () => {
  let db: Kysely<Database>;
  let sut: ChannelPriorityService;

  beforeEach(async () => {
    db = await createTestDb();
    sut = buildSut(db);
  });

  describe("activeOnly: false", () => {
    it("returns channels ordered by scrapingScore descending", async () => {
      await seedChannel(db, "ch-a", "Channel A");
      await seedChannel(db, "ch-b", "Channel B");
      await seedPriorityScore(db, "ch-a", 5.0);
      await seedPriorityScore(db, "ch-b", 9.0);

      const result = await sut.getTopChannels({ activeOnly: false });

      assert.ok(result.ok);
      assert.equal(result.value.length, 2);
      assert.equal(result.value[0].id, "ch-b");
      assert.equal(result.value[1].id, "ch-a");
    });

    it("excludes channels with no priority score", async () => {
      await seedChannel(db, "ranked", "Ranked");
      await seedChannel(db, "unranked", "Unranked");
      await seedPriorityScore(db, "ranked", 3.0);

      const result = await sut.getTopChannels({ activeOnly: false });

      assert.ok(result.ok);
      assert.equal(result.value.length, 1);
      assert.equal(result.value[0].id, "ranked");
    });

    it("returns correct processedCount and totalCount", async () => {
      await seedChannel(db, "ch-1", "Channel 1");
      await seedPriorityScore(db, "ch-1", 1.0);
      await seedVideoJob(db, "ch-1", "v1", "SUCCEEDED");
      await seedVideoJob(db, "ch-1", "v2", "SUCCEEDED");
      await seedVideoJob(db, "ch-1", "v3", "PENDING");

      const result = await sut.getTopChannels({ activeOnly: false });

      assert.ok(result.ok);
      const ch = result.value[0];
      assert.equal(ch.processedCount, 2);
      assert.equal(ch.totalCount, 3);
    });

    it("returns subscriberCount and name", async () => {
      await seedChannel(db, "ch-1", "My Channel", 500000);
      await seedPriorityScore(db, "ch-1", 1.0);

      const result = await sut.getTopChannels({ activeOnly: false });

      assert.ok(result.ok);
      assert.equal(result.value[0].name, "My Channel");
      assert.equal(result.value[0].subscriberCount, 500000);
    });

    it("limits results to 10", async () => {
      for (let i = 0; i < 15; i++) {
        await seedChannel(db, `ch-${i}`, `Channel ${i}`);
        await seedPriorityScore(db, `ch-${i}`, i);
      }

      const result = await sut.getTopChannels({ activeOnly: false });

      assert.ok(result.ok);
      assert.equal(result.value.length, 10);
    });
  });

  describe("activeOnly: true", () => {
    it("includes channels with at least one PENDING job", async () => {
      await seedChannel(db, "active", "Active Channel");
      await seedChannel(db, "done", "Done Channel");
      await seedPriorityScore(db, "active", 5.0);
      await seedPriorityScore(db, "done", 9.0);
      await seedVideoJob(db, "active", "v1", "PENDING");
      await seedVideoJob(db, "done", "v1", "SUCCEEDED");

      const result = await sut.getTopChannels({ activeOnly: true });

      assert.ok(result.ok);
      assert.equal(result.value.length, 1);
      assert.equal(result.value[0].id, "active");
    });

    it("includes channels with at least one PROCESSING job", async () => {
      await seedChannel(db, "ch-1", "Channel 1");
      await seedPriorityScore(db, "ch-1", 1.0);
      await seedVideoJob(db, "ch-1", "v1", "PROCESSING");

      const result = await sut.getTopChannels({ activeOnly: true });

      assert.ok(result.ok);
      assert.equal(result.value.length, 1);
    });

    it("excludes channels where all jobs are SUCCEEDED", async () => {
      await seedChannel(db, "ch-1", "Done Channel");
      await seedPriorityScore(db, "ch-1", 1.0);
      await seedVideoJob(db, "ch-1", "v1", "SUCCEEDED");
      await seedVideoJob(db, "ch-1", "v2", "SUCCEEDED");

      const result = await sut.getTopChannels({ activeOnly: true });

      assert.ok(result.ok);
      assert.equal(result.value.length, 0);
    });

    it("excludes channels with no video jobs at all", async () => {
      await seedChannel(db, "ch-1", "Empty Channel");
      await seedPriorityScore(db, "ch-1", 1.0);

      const result = await sut.getTopChannels({ activeOnly: true });

      assert.ok(result.ok);
      assert.equal(result.value.length, 0);
    });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
node --test --import tsx "src/modules/scraping/channel-priority/channel-priority.service.test.ts"
```

Expected: Fails with `TypeError: sut.getTopChannels is not a function`

- [ ] **Step 3: Add `TopChannel` type and `getTopChannels` method to `ChannelPriorityService`**

Add the `TopChannel` export type before the class declaration:

```typescript
export type TopChannel = {
  id: string;
  name: string;
  scrapingScore: number;
  subscriberCount: number | null;
  processedCount: number;
  totalCount: number;
};
```

Add this public method and private helper to `ChannelPriorityService` (after `getStoredScrapingScore`):

```typescript
public async getTopChannels({
  activeOnly,
}: {
  activeOnly: boolean;
}): Promise<Result<TopChannel[], DatabaseError>> {
  const result = await tryCatch(this.doGetTopChannels({ activeOnly }));
  if (!result.ok) return Failure({ type: "DATABASE", error: result.error });
  return Success(result.value);
}

private async doGetTopChannels({
  activeOnly,
}: {
  activeOnly: boolean;
}): Promise<TopChannel[]> {
  const rows = await this.db
    .selectFrom("channelPriorityScores")
    .innerJoin("channels", "channels.id", "channelPriorityScores.channelId")
    .leftJoin("videoJobs", "videoJobs.channelId", "channels.id")
    .select([
      "channels.id",
      "channels.name",
      "channels.subscriberCount",
      "channelPriorityScores.scrapingScore",
      (eb) =>
        eb.fn
          .count<string>("videoJobs.id")
          .filterWhere("videoJobs.status", "=", "SUCCEEDED")
          .as("processedCount"),
      (eb) => eb.fn.count<string>("videoJobs.id").as("totalCount"),
    ])
    .groupBy([
      "channels.id",
      "channels.name",
      "channels.subscriberCount",
      "channelPriorityScores.scrapingScore",
    ])
    .$if(activeOnly, (qb) =>
      qb.having((eb) =>
        eb(
          eb.fn
            .count<string>("videoJobs.id")
            .filterWhere("videoJobs.status", "in", ["PENDING", "PROCESSING"]),
          ">",
          eb.lit(0),
        ),
      ),
    )
    .orderBy("channelPriorityScores.scrapingScore", "desc")
    .limit(10)
    .execute();

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    scrapingScore: row.scrapingScore,
    subscriberCount: row.subscriberCount,
    processedCount: Number(row.processedCount),
    totalCount: Number(row.totalCount),
  }));
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
node --test --import tsx "src/modules/scraping/channel-priority/channel-priority.service.test.ts"
```

Expected: All tests pass (13 passing).

- [ ] **Step 5: Commit**

```bash
git add src/modules/scraping/channel-priority/channel-priority.service.ts src/modules/scraping/channel-priority/channel-priority.service.test.ts
git commit -m "feat(channel-priority): add getTopChannels method with activeOnly filter"
```

---

### Task 2: Create `GetTopChannelsByPriorityUseCase`

**Files:**
- Create: `src/modules/scraping/channel-priority/get-top-channels-by-priority.use-case.ts`

**Interfaces:**
- Consumes: `ChannelPriorityService.getTopChannels({ activeOnly: boolean })` returning `Promise<Result<TopChannel[], DatabaseError>>`
- Produces: `GetTopChannelsByPriorityUseCase` with `execute({ activeOnly: boolean })` returning the same result type

---

- [ ] **Step 1: Create the use case file**

```typescript
import { injectable } from "inversify";
import { ChannelPriorityService } from "./channel-priority.service.js";

@injectable()
export class GetTopChannelsByPriorityUseCase {
  constructor(
    private readonly channelPriorityService: ChannelPriorityService,
  ) {}

  async execute({ activeOnly }: { activeOnly: boolean }) {
    return this.channelPriorityService.getTopChannels({ activeOnly });
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: No errors (0 output).

- [ ] **Step 3: Commit**

```bash
git add src/modules/scraping/channel-priority/get-top-channels-by-priority.use-case.ts
git commit -m "feat(channel-priority): add GetTopChannelsByPriorityUseCase"
```

---

### Task 3: Create `PriorityController` and wire into `TelegramBot`

**Files:**
- Create: `src/modules/telegram/priority.controller.ts`
- Modify: `src/modules/telegram/telegram-bot.ts`

**Interfaces:**
- Consumes: `GetTopChannelsByPriorityUseCase.execute({ activeOnly: boolean })` returning `Promise<Result<TopChannel[], DatabaseError>>`
- Consumes: `TopChannel` type from `channel-priority.service.ts`

---

- [ ] **Step 1: Create `PriorityController`**

```typescript
import { injectable } from "inversify";
import type { Context } from "telegraf";
import { Telegraf } from "telegraf";
import { Logger } from "../_common/logger/logger.js";
import { TopChannel } from "../scraping/channel-priority/channel-priority.service.js";
import { GetTopChannelsByPriorityUseCase } from "../scraping/channel-priority/get-top-channels-by-priority.use-case.js";
import { TelegramController } from "./telegram-controller.js";

function formatSubscriberCount(count: number | null): string {
  if (count === null) return "?";
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${Math.round(count / 1_000)}k`;
  return String(count);
}

function formatChannel(ch: TopChannel, rank: number): string {
  const score = ch.scrapingScore.toFixed(2);
  const subs = formatSubscriberCount(ch.subscriberCount);
  return `${rank}. ${ch.name} — score: ${score} | subs: ${subs} | videos: ${ch.processedCount}/${ch.totalCount}`;
}

@injectable()
export class PriorityController implements TelegramController {
  constructor(
    private readonly logger: Logger,
    private readonly getTopChannelsByPriorityUseCase: GetTopChannelsByPriorityUseCase,
  ) {
    this.logger.setContext(PriorityController.name);
  }

  public register(bot: Telegraf): void {
    bot.command("priority_all", async (ctx) => {
      this.logger.info("Received /priority_all command");
      await this.handleCommand(ctx, false);
    });

    bot.command("priority_active", async (ctx) => {
      this.logger.info("Received /priority_active command");
      await this.handleCommand(ctx, true);
    });
  }

  private async handleCommand(
    ctx: Context,
    activeOnly: boolean,
  ): Promise<void> {
    const result = await this.getTopChannelsByPriorityUseCase.execute({
      activeOnly,
    });

    if (!result.ok) {
      await ctx.reply("Failed to load channels.");
      return;
    }

    if (result.value.length === 0) {
      await ctx.reply(
        activeOnly ? "No active channels found." : "No channels found.",
      );
      return;
    }

    const lines = result.value.map((ch, i) => formatChannel(ch, i + 1));
    const header = activeOnly
      ? "Top active channels by priority:"
      : "Top channels by priority:";

    await ctx.reply(`${header}\n\n${lines.join("\n")}`);
  }
}
```


- [ ] **Step 2: Wire `PriorityController` into `TelegramBot`**

In `src/modules/telegram/telegram-bot.ts`:

Add the import:
```typescript
import { PriorityController } from "./priority.controller.js";
```

Add to the constructor parameter list (after `recalculatePriorityController`):
```typescript
private readonly priorityController: PriorityController,
```

Add to `registerControllers()` (after `this.recalculatePriorityController.register(this.bot)`):
```typescript
this.priorityController.register(this.bot);
```

Add to `syncCommands()` array (after the `recalculate_priority` entry):
```typescript
{ command: "priority_all", description: "Show top 10 channels by priority" },
{ command: "priority_active", description: "Show top 10 active channels by priority" },
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: No errors (0 output).

- [ ] **Step 4: Run all tests to check for regressions**

```bash
node --test --import tsx "src/**/*.test.ts"
```

Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/modules/telegram/priority.controller.ts src/modules/telegram/telegram-bot.ts
git commit -m "feat(telegram): add /priority_all and /priority_active commands"
```
