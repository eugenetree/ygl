# Phase 1: DB Schema + Infrastructure - Research

**Researched:** 2026-04-08
**Domain:** Kysely migrations, PostgreSQL single-row IPC table, InversifyJS class registration
**Confidence:** HIGH

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| IPC-01 | `scraper_control` table with single seeded row: `desired_state`, `actual_state`, `heartbeat_at`, `updated_at` | Migration pattern from `1774200000000-create-scraper-config.ts`; single-row seed with INSERT on first migration |
| IPC-02 | `ScraperProcess` class (bot-side, DB queries inside): `requestStop()`, `requestKill()`, `requestStart()`, `getStatus()` | Follows `ScraperConfigRepository` pattern; `@injectable()`, Kysely via `dbClient`, `Result<T, E>` returns |
| IPC-03 | `ScraperControlRepository` (scraper-side): `setActualState(state)`, `updateHeartbeat()` | Same Kysely/Result pattern; UPDATE-only (no INSERT), touches only owned columns |
</phase_requirements>

---

## Summary

Phase 1 adds a single PostgreSQL table (`scraper_control`) and two thin typed wrappers — one per process — that give the bot and scraper a shared, database-backed IPC contract. No bot or scraper logic changes in this phase; the classes simply provide the typed surface that later phases call.

The codebase already has a mature Kysely migration system, a clear `@injectable()` + Result-type repository pattern, and an InversifyJS container in `src/main.ts`. Everything in this phase slots directly into those existing patterns. The new migration is the 15th in the series and follows the exact same file structure as the most recent one (`1774200000000-create-scraper-config.ts`).

The only meaningful design decision is the column naming convention: the locked decisions in STATE.md use `desired_state` / `actual_state` (snake_case in SQL), which Kysely's `CamelCasePlugin` will map to `desiredState` / `actualState` in TypeScript. All timestamps follow the existing `timestamptz`-based pattern established in recent migrations.

**Primary recommendation:** Write the migration and two classes as drop-in additions to the existing patterns. No new npm dependencies, no new tooling, no architectural decisions — Phase 1 is purely additive.

---

## User Constraints

No CONTEXT.md exists for this phase. The locked decisions come from STATE.md directly.

### Locked Decisions (from STATE.md)

- IPC via PostgreSQL `scraper_control` table (single row, desired/actual state)
- `ScraperProcess` class on bot side (concrete, DB queries inside, not a repository)
- `ScraperControlRepository` on scraper side (writes `actual_state` + `heartbeat_at`)
- `ScraperConfigRepository` stays as-is (domain model of operations subdomain)
- Scraper always auto-starts on container boot — no `desired_state` check for startup
- Orchestrator idles (sleep + retry) when queue empty — never self-stops
- Bot runs persistent background watcher for all state change notifications

### Deferred / Out of Scope for Phase 1

- Scraper standalone entry point (Phase 2)
- Bot standalone entry point (Phase 3)
- Docker Compose split (Phase 4)
- Any polling or watcher logic — only the DB schema + typed accessors are built here

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| kysely | 0.27.5 | SQL query builder, migration runner | Already in use; all 14 existing migrations use it |
| pg | 8.12.0 | PostgreSQL driver | Already in use via `dbClient` |
| inversify | 7.9.1 | DI container, `@injectable()` decorator | All injectable classes in the project use it |
| reflect-metadata | 0.2.2 | Required by InversifyJS decorators | Already imported first in every entry point |

[VERIFIED: codebase `package.json`]

### No New Dependencies

This phase requires zero new npm packages. All tooling (Kysely migrations, InversifyJS, `dbClient`, `tryCatch`, `Result` types) is already installed.

**Installation:** none required.

---

## Architecture Patterns

### Migration Pattern (from existing codebase)

All migrations follow this exact structure:
[VERIFIED: codebase `src/db/migrations/1774200000000-create-scraper-config.ts`]

```typescript
// src/db/migrations/{timestamp}-create-scraper-control.ts
import { Kysely, sql } from "kysely";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable("scraperControl")
    .addColumn("id", "uuid", (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn("desiredState", "text", (col) => col.notNull())
    .addColumn("actualState", "text", (col) => col.notNull())
    .addColumn("heartbeatAt", "timestamptz")
    .addColumn("updatedAt", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .execute();

  // Seed exactly one row
  await db
    .insertInto("scraperControl")
    .values({
      desiredState: "STOPPED",
      actualState: "IDLE",
      heartbeatAt: null,
      updatedAt: new Date(),
    })
    .execute();
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable("scraperControl").execute();
}
```

**Key migration conventions observed in the codebase:**
- Table name in `createTable()` uses camelCase (e.g. `"scraperControl"`) — `CamelCasePlugin` handles SQL translation
- `uuid` primary key with `gen_random_uuid()` default (consistent across all tables)
- `sql\`now()\`` template tag for SQL expressions, not JS `new Date()` (for default values)
- `// eslint-disable-next-line @typescript-eslint/no-explicit-any` above both function signatures
- `timestamptz` for timestamp columns (latest migrations use this; older ones use `timestamp` without timezone — use `timestamptz` for new work)
- `down` drops tables in reverse dependency order

[VERIFIED: codebase — all 14 migrations inspected]

### Timestamp Format for Migration Filename

Existing migrations use Unix-epoch-like numeric timestamps (e.g. `1774200000000`). The `create-migration-file.ts` script uses `Date.now()` — call `npm run db:migration:create-new scraper-control` to auto-generate the correct filename prefix.

[VERIFIED: codebase `src/db/scripts/create-migration-file.ts`]

### Database Type Registration Pattern

After the migration, add the table to `src/db/types.ts`:
[VERIFIED: codebase `src/db/types.ts`]

```typescript
// In Database interface
export interface Database {
  // ... existing tables ...
  scraperControl: ScraperControlRow;  // add this
}

// New row interface
export interface ScraperControlRow {
  id: Generated<string>;
  desiredState: string;
  actualState: string;
  heartbeatAt: Date | null;
  updatedAt: Generated<Date>;
}

// Selectable helper (follow existing pattern)
export type ScraperControlSelectable = Selectable<ScraperControlRow>;
```

**State value types:** The requirements specify exact string literal sets for each column:
- `desiredState`: `"STOPPED" | "KILLED"` — written by bot only
- `actualState`: `"IDLE" | "STARTING" | "RUNNING" | "STOPPING" | "STOPPED" | "ERROR"` — written by scraper only

These are stored as `text` in PostgreSQL (no enum type needed; existing job status columns use a custom `processing_status` enum, but the control table is new and keeping it as `text` avoids a separate enum migration). Define TypeScript union types in `src/db/types.ts` alongside the interface.

[VERIFIED: codebase — `ScraperConfigRow` uses plain `text`; `processing_status` enum exists only because it was created in a dedicated migration `1746916250123-processing-status-enum.ts`]

### Repository Pattern (ScraperControlRepository)

`ScraperControlRepository` (scraper-side writer) follows the `ScraperConfigRepository` pattern exactly:
[VERIFIED: codebase `src/modules/scraping/config/scraper-config.repository.ts`]

```typescript
// src/modules/scraping/scraper-control.repository.ts
import { injectable } from "inversify";

import { dbClient } from "../../db/client.js";
import { ActualScraperState, DatabaseError } from "../../db/types.js";
import { Failure, Result, Success } from "../../types/index.js";
import { tryCatch } from "../_common/try-catch.js";

@injectable()
export class ScraperControlRepository {
  public async setActualState(
    state: ActualScraperState,
  ): Promise<Result<void, DatabaseError>> {
    const result = await tryCatch(
      dbClient
        .updateTable("scraperControl")
        .set({ actualState: state, updatedAt: new Date() })
        .execute(),
    );

    if (!result.ok) {
      return Failure({ type: "DATABASE", error: result.error });
    }

    return Success(undefined);
  }

  public async updateHeartbeat(): Promise<Result<void, DatabaseError>> {
    const result = await tryCatch(
      dbClient
        .updateTable("scraperControl")
        .set({ heartbeatAt: new Date(), updatedAt: new Date() })
        .execute(),
    );

    if (!result.ok) {
      return Failure({ type: "DATABASE", error: result.error });
    }

    return Success(undefined);
  }
}
```

**Important:** `setActualState` must NOT touch `desiredState` or `heartbeatAt`. `updateHeartbeat` must NOT touch `desiredState` or `actualState`. Each method owns only its columns.

### ScraperProcess Pattern (bot-side handle)

`ScraperProcess` is described in STATE.md and requirements as a concrete class with DB queries inside — not a repository. It reads the current row and writes `desired_state`. Its contract:
[ASSUMED — class name and method signatures come from REQUIREMENTS.md, not yet-existing code]

```typescript
// src/modules/scraping/scraper-process.ts
import { injectable } from "inversify";

import { dbClient } from "../../db/client.js";
import { DatabaseError, ScraperControlSelectable } from "../../db/types.js";
import { Failure, Result, Success } from "../../types/index.js";
import { tryCatch } from "../_common/try-catch.js";

@injectable()
export class ScraperProcess {
  public async requestStart(): Promise<Result<void, DatabaseError>> {
    const result = await tryCatch(
      dbClient
        .updateTable("scraperControl")
        .set({ desiredState: "RUNNING", updatedAt: new Date() })
        .execute(),
    );
    if (!result.ok) return Failure({ type: "DATABASE", error: result.error });
    return Success(undefined);
  }

  public async requestStop(): Promise<Result<void, DatabaseError>> {
    const result = await tryCatch(
      dbClient
        .updateTable("scraperControl")
        .set({ desiredState: "STOPPED", updatedAt: new Date() })
        .execute(),
    );
    if (!result.ok) return Failure({ type: "DATABASE", error: result.error });
    return Success(undefined);
  }

  public async requestKill(): Promise<Result<void, DatabaseError>> {
    const result = await tryCatch(
      dbClient
        .updateTable("scraperControl")
        .set({ desiredState: "KILLED", updatedAt: new Date() })
        .execute(),
    );
    if (!result.ok) return Failure({ type: "DATABASE", error: result.error });
    return Success(undefined);
  }

  public async getStatus(): Promise<
    Result<ScraperControlSelectable, DatabaseError>
  > {
    const result = await tryCatch(
      dbClient
        .selectFrom("scraperControl")
        .selectAll()
        .executeTakeFirstOrThrow(),
    );
    if (!result.ok) return Failure({ type: "DATABASE", error: result.error });
    return Success(result.value);
  }
}
```

**Note on `requestStart`:** The locked decision says "scraper always auto-starts on container boot — no `desired_state` check for startup." This means `requestStart()` writing `desired_state = "RUNNING"` is a signal for the bot to use if needed (e.g. BOT-03 `/start` command in Phase 3), not a trigger the scraper polls at boot. The scraper ignores `desired_state` at startup — it boots and runs unconditionally.

### File Location Convention

Following the codebase structure:
[VERIFIED: codebase directory layout]

```
src/
  db/
    migrations/
      {timestamp}-create-scraper-control.ts   ← Plan 1.1
    types.ts                                   ← add ScraperControlRow + type aliases
  modules/
    scraping/
      scraper-process.ts                       ← Plan 1.2 (bot-side)
      scraper-control.repository.ts            ← Plan 1.2 (scraper-side)
```

`ScraperProcess` lives in `src/modules/scraping/` (alongside `scraper.orchestrator.ts`), not in `src/modules/telegram/` — it is an IPC handle, not a Telegram concern.

### DI Registration in main.ts

Both new classes must be bound in `src/main.ts` for the existing app to boot:
[VERIFIED: codebase `src/main.ts` — current container uses `autobind: true`]

With `autobind: true`, InversifyJS resolves classes lazily on first `.get()` call. Since `main.ts` uses `Container({ autobind: true })`, both `ScraperProcess` and `ScraperControlRepository` will be auto-bound as long as they are decorated with `@injectable()` and their constructor dependencies (only `dbClient`, which is a module-level singleton) are satisfied.

However, `dbClient` is not injected via DI — it is imported directly as a module-level singleton (the same pattern used in `ScraperConfigRepository`, `StatsRepository`, and every other repository). So no explicit `.bind()` call is needed in `main.ts` for these classes — they are fully self-contained.

[VERIFIED: codebase `src/modules/scraping/config/scraper-config.repository.ts` — uses `dbClient` directly, not injected]

### Anti-Patterns to Avoid

- **Do not use a PostgreSQL enum for state values.** The existing `processing_status` enum required a dedicated migration (`1746916250123-processing-status-enum.ts`). Using `text` for new state columns avoids that overhead and is the pattern used in `scraperConfig`.
- **Do not add `heartbeatAt NOT NULL`.** On a fresh migration, before the scraper has run its first loop, `heartbeatAt` is NULL. The column must allow NULL.
- **Do not insert multiple rows.** The single-row pattern is the invariant. Both `ScraperProcess` and `ScraperControlRepository` use `updateTable` exclusively (no `insertInto` after migration).
- **Do not touch sibling columns.** `setActualState` must not update `desiredState`; `requestStop` must not update `actualState`. Each class owns only the columns it is responsible for (this is the IPC contract boundary).
- **Do not use `executeTakeFirst` in ScraperControlRepository writes.** `updateTable` without `.returning()` returns `UpdateResult` — use `.execute()`, not `.executeTakeFirst()`. Only `getStatus()` in `ScraperProcess` uses `executeTakeFirstOrThrow()`.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Wrapping DB errors | Custom try/catch | `tryCatch()` from `_common/try-catch.ts` | Already in every repository; consistent pattern |
| Result type | Custom OK/error wrapper | `Result<T,E>`, `Success()`, `Failure()` from `src/types/index.ts` | Established in all 15+ repository methods |
| DB connection | New pool | `dbClient` from `src/db/client.ts` | Single pool, already configured |
| Migration timestamp | Hardcode a number | `npm run db:migration:create-new scraper-control` | Generates correct `Date.now()` prefix automatically |

---

## Common Pitfalls

### Pitfall 1: CamelCase vs snake_case mismatch

**What goes wrong:** Kysely's `CamelCasePlugin` (configured in `src/db/client.ts`) automatically converts between camelCase TypeScript and snake_case SQL. If the migration uses `"desiredState"` as the Kysely column name (camelCase), the plugin generates `desired_state` in SQL. If the TypeScript interface uses `desiredState`, queries type-check. This is correct and consistent with all existing tables.

**The trap:** Mixing conventions — e.g., writing `desired_state` in the TypeScript interface (snake_case) while the plugin expects camelCase. This breaks type inference without a compilation error.

**How to avoid:** Use camelCase in all TypeScript interfaces and Kysely method calls. Let the plugin handle SQL translation. Follow exactly what `ScraperConfigRow` does: `scraperName`, `enabled` — never `scraper_name`.

[VERIFIED: codebase `src/db/client.ts` — `CamelCasePlugin` is installed; `src/db/types.ts` — all interfaces use camelCase]

### Pitfall 2: Forgetting `updatedAt` on UPDATE

**What goes wrong:** `ScraperControlRepository.setActualState()` and `ScraperProcess.requestStop()` must include `.set({ ..., updatedAt: new Date() })`. If omitted, the `updated_at` column stays at its initial seed value. Phase 2 and 3 will rely on `updated_at` to detect recent changes.

**How to avoid:** Both `setActualState` and every `requestX` method in `ScraperProcess` must always set `updatedAt: new Date()`.

### Pitfall 3: `executeTakeFirstOrThrow` throws on missing row

**What goes wrong:** `ScraperProcess.getStatus()` uses `executeTakeFirstOrThrow()`. If the migration has not run yet or the seed row was deleted, this throws. The `tryCatch` wrapper catches the throw and returns `Failure`, but the error message will be confusing.

**How to avoid:** The migration seeds exactly one row. `getStatus()` can safely use `executeTakeFirstOrThrow()` because the table invariant is "always exactly one row." Document this invariant in a comment on the method.

### Pitfall 4: desiredState = "RUNNING" — not used for auto-start

**What goes wrong:** A developer reading `requestStart()` might assume the scraper polls `desiredState` at boot and starts only when it sees `"RUNNING"`. The locked decisions explicitly say: "Scraper always auto-starts on container boot — no `desired_state` check for startup."

**How to avoid:** Add a comment to `requestStart()` explaining it is used by the bot to signal the scraper when it wants it to start (for the Phase 3 restart flow), but the scraper itself ignores `desired_state` at boot.

### Pitfall 5: Using the wrong `desired_state` values

**What goes wrong:** The requirements say `desired_state` only has two values: `"STOPPED"` and `"KILLED"`. Writing `"RUNNING"` to `desired_state` is used only by `requestStart()` (BOT-03 flow) — but the scraper will never poll for this at boot. The planner should confirm whether `desired_state` needs a `"RUNNING"` value at all for Phase 1 or whether `requestStart()` writes something else.

**Clarification from requirements:** IPC-01 says `desired_state` values are `STOPPED/KILLED`. IPC-02 says `ScraperProcess` has a `requestStart()` method. These are slightly in tension for Phase 1 — `requestStart()` needs to write _something_. The sensible resolution: `requestStart()` writes `desiredState: "RUNNING"` and the Phase 2 scraper can check this if needed (or ignore it at boot). The `desired_state` column should accommodate `"RUNNING"` even though its primary use is `"STOPPED"/"KILLED"`.

[ASSUMED — the exact value `requestStart()` writes is not spelled out in requirements IPC-01 or IPC-02; writing `"RUNNING"` is the logical choice]

---

## Code Examples

### Verified Migration Seed Pattern
Source: [VERIFIED: codebase `src/db/migrations/1774200000000-create-scraper-config.ts`]

```typescript
await db.insertInto("scraperConfig").values([
  { scraperName: ScraperName.CHANNEL_DISCOVERY, enabled: true },
  // ...
]).execute();
```

The `scraper_control` migration seeds a single row directly in `values({...})`, not an array.

### Verified Kysely UPDATE Pattern
Source: [VERIFIED: codebase `src/modules/scraping/config/scraper-config.repository.ts`]

```typescript
await dbClient
  .updateTable("scraperConfig")
  .set(config)
  .where("scraperName", "=", config.scraperName)
  .returningAll()
  .executeTakeFirstOrThrow()
```

For `scraperControl`, since there is only one row and no need for a return value on state writes, the simpler form without `.where()` is correct (UPDATE applies to the single row):

```typescript
await dbClient
  .updateTable("scraperControl")
  .set({ actualState: state, updatedAt: new Date() })
  .execute()
```

### Verified tryCatch + Result Pattern
Source: [VERIFIED: codebase `src/modules/_common/try-catch.ts`, `src/modules/scraping/config/scraper-config.repository.ts`]

```typescript
const result = await tryCatch(
  dbClient.updateTable("scraperControl").set({ ... }).execute()
);
if (!result.ok) {
  return Failure({ type: "DATABASE", error: result.error });
}
return Success(undefined);
```

---

## Environment Availability

Step 2.6: SKIPPED — Phase 1 is purely code/schema additions. No new external tools or services beyond PostgreSQL (already running) are required. The migration runner (`npm run db:migration:run`) uses `tsx` and `pg` — both already installed.

---

## Validation Architecture

`workflow.nyquist_validation` is `false` in `.planning/config.json`. This section is omitted.

---

## Open Questions

1. **`requestStart()` writes what value to `desiredState`?**
   - What we know: IPC-01 enumerates `desired_state` as `STOPPED | KILLED`. IPC-02 says `ScraperProcess` has `requestStart()`.
   - What's unclear: Does `requestStart()` write `"RUNNING"` to `desiredState` (extending the column's domain), or write nothing/something else?
   - Recommendation: Write `"RUNNING"` to `desiredState`. Phase 2 can decide whether the scraper ever reads this value. The column should remain `text` (not an enum) so adding values is frictionless. Document in a comment.

2. **`desiredState` initial seed value**
   - What we know: Requirements say scraper auto-starts on boot without checking `desired_state`.
   - What's unclear: Should the seeded row have `desiredState = "STOPPED"` (neutral state) or something else?
   - Recommendation: Seed with `desiredState = "STOPPED"` and `actualState = "IDLE"`. This is the cleanest initial state: the scraper boots and becomes RUNNING, but the desired state starts at "don't send any signals."

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `requestStart()` should write `desiredState = "RUNNING"` since that is the logical opposite of `"STOPPED"` | Common Pitfalls #5, Code Patterns | Low — column is `text`, adding a value is trivial and requires no schema change |
| A2 | `ScraperProcess` lives in `src/modules/scraping/` (not in a new `src/modules/ipc/` directory) | Architecture Patterns (file locations) | Low — purely a file placement choice; moving it later has no logic impact |
| A3 | No `@where()` clause needed on `scraperControl` UPDATE calls (single row table invariant) | Code Examples | Low — if somehow two rows exist, all UPDATE calls would update both. The invariant must be maintained by the migration seeding exactly one row. |

---

## Sources

### Primary (HIGH confidence — verified in this session)
- Codebase `src/db/migrations/1774200000000-create-scraper-config.ts` — migration structure, seed pattern, naming conventions
- Codebase `src/db/migrations/1773200000000-create-job-tables.ts` — `timestamptz`, `uuid`, `gen_random_uuid()` patterns
- Codebase `src/db/client.ts` — `CamelCasePlugin` confirmed
- Codebase `src/db/types.ts` — Database interface structure, `Generated<T>` pattern, `Selectable<>` helpers
- Codebase `src/db/scripts/create-migration-file.ts` — migration filename generation via `Date.now()`
- Codebase `src/modules/scraping/config/scraper-config.repository.ts` — full repository pattern with `tryCatch`, `@injectable()`, Kysely
- Codebase `src/modules/_common/try-catch.ts` — `tryCatch` wrapper
- Codebase `src/types/index.ts` — `Result<T,E>`, `Success()`, `Failure()` types
- Codebase `src/main.ts` — container wiring, `autobind: true`
- `.planning/codebase/CONVENTIONS.md` — naming, DI, error handling patterns
- `.planning/codebase/STACK.md` — versions, CamelCasePlugin, module system
- `.planning/codebase/ARCHITECTURE.md` — repository layer, composition root
- `.planning/research/STACK.md` — IPC design decisions (single-row desired/actual pattern)
- `.planning/research/PITFALLS.md` — Phase-1-specific warnings (heartbeatAt, stale state, race conditions)

### Secondary (MEDIUM confidence)
- `.planning/STATE.md` — locked decisions (these are project decisions, not external docs)
- `.planning/REQUIREMENTS.md` — IPC-01, IPC-02, IPC-03 column specifications

---

## Metadata

**Confidence breakdown:**
- Migration pattern: HIGH — 14 existing migrations verified; pattern is fully established
- TypeScript types registration: HIGH — verified `Database` interface and helper type pattern
- `ScraperControlRepository` implementation: HIGH — matches `ScraperConfigRepository` exactly
- `ScraperProcess` implementation: HIGH — standard Kysely UPDATE + Result pattern; method semantics from requirements
- `requestStart()` writes `"RUNNING"`: ASSUMED — not specified in requirements, logical inference

**Research date:** 2026-04-08
**Valid until:** Stable (migration conventions and Kysely patterns in this codebase do not change between phases)
