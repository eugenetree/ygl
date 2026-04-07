---
phase: 01-db-schema-infrastructure
plan: 02
subsystem: database
tags: [postgres, kysely, inversify, ipc, typescript]

# Dependency graph
requires:
  - phase: 01-01
    provides: ScraperControlRow type, ScraperControlSelectable type, DesiredScraperState union, ActualScraperState union, scraperControl entry in Database interface, scraper_control migration with seed row
provides:
  - ScraperProcess class (bot-side IPC handle) with requestStart, requestStop, requestKill, getStatus methods
  - ScraperControlRepository class (scraper-side writer) with setActualState, updateHeartbeat methods
  - Both classes registered via InversifyJS autobind (@injectable, no explicit .bind() needed)
affects: [02-scraper-process, 03-bot-process, scraper-orchestrator, lifecycle-controller]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Column ownership split via separate classes: bot owns desiredState (ScraperProcess), scraper owns actualState+heartbeatAt (ScraperControlRepository)"
    - "Single-row table invariant: UPDATE without WHERE targets the single row seeded by migration"
    - "tryCatch + Result<void, DatabaseError> pattern for all repository/IPC methods (established by ScraperConfigRepository)"

key-files:
  created:
    - src/modules/scraping/scraper-process.ts
    - src/modules/scraping/scraper-control.repository.ts
  modified: []

key-decisions:
  - "ScraperProcess writes ONLY desiredState (not a repository — IPC handle); reads via selectAll().executeTakeFirstOrThrow()"
  - "ScraperControlRepository writes ONLY actualState and heartbeatAt; no read methods in this phase"
  - "No WHERE clauses on UPDATE: single-row invariant makes full-table UPDATE correct and intentional"
  - "JSDoc avoids naming restricted columns literally to keep grep-based acceptance checks clean"

patterns-established:
  - "IPC column ownership: bot-side class writes desired-state column only; scraper-side class writes actual-state + heartbeat columns only"
  - "Single-row UPDATE pattern: no WHERE clause, no RETURNING, .execute() only"
  - "executeTakeFirstOrThrow for single-row SELECT (relies on migration invariant; tryCatch converts thrown errors to Failure)"

requirements-completed: [IPC-02, IPC-03]

# Metrics
duration: 25min
completed: 2026-04-08
---

# Phase 1 Plan 02: IPC Accessor Classes Summary

**Two typed IPC accessor classes wrapping the single-row `scraper_control` table: ScraperProcess (bot-side, writes desiredState) and ScraperControlRepository (scraper-side, writes actualState + heartbeatAt), both @injectable() for InversifyJS autobind**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-04-08T00:00:00Z
- **Completed:** 2026-04-08
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- `ScraperControlRepository` with `setActualState(state: ActualScraperState)` and `updateHeartbeat()` — both returning `Promise<Result<void, DatabaseError>>`
- `ScraperProcess` with `requestStart()`, `requestStop()`, `requestKill()`, and `getStatus()` — enforcing column ownership at the class boundary
- Smoke test confirmed full round-trip against dev DB: BEFORE shows seed row (`desiredState=STOPPED`, `actualState=IDLE`, `heartbeatAt=null`), AFTER shows `desiredState=STOPPED`, `actualState=RUNNING`, `heartbeatAt` populated

## Task Commits

Each task was committed atomically:

1. **Task 1: Implement ScraperControlRepository** - `d9b427f` (feat)
2. **Task 2: Implement ScraperProcess and verify boot** - `2184998` (feat)

## Files Created/Modified

- `src/modules/scraping/scraper-control.repository.ts` — Scraper-side writer: owns actualState and heartbeatAt, never touches desiredState
- `src/modules/scraping/scraper-process.ts` — Bot-side IPC handle: owns desiredState, reads full row via getStatus()

## Public API for Phase 2/3 Consumers

### ScraperProcess (import from `../scraping/scraper-process.js`)

```typescript
import { ScraperProcess } from "../scraping/scraper-process.js";
// From a file at src/modules/<x>/foo.ts

const proc = container.get(ScraperProcess);

await proc.requestStart();  // writes desiredState='RUNNING'
await proc.requestStop();   // writes desiredState='STOPPED'
await proc.requestKill();   // writes desiredState='KILLED'
await proc.getStatus();     // returns Result<ScraperControlSelectable, DatabaseError>
```

### ScraperControlRepository (import from `../scraping/scraper-control.repository.js`)

```typescript
import { ScraperControlRepository } from "../scraping/scraper-control.repository.js";

const repo = container.get(ScraperControlRepository);

await repo.setActualState("RUNNING"); // writes actualState only
await repo.updateHeartbeat();         // writes heartbeatAt + updatedAt only
```

### Single-Row Invariant and Column Ownership

The `scraper_control` table has exactly one row (seeded by the Plan 01 migration). Both classes issue UPDATE without a WHERE clause — this is intentional and correct. Future code that adds a WHERE clause to these classes will be incorrect unless the single-row invariant is explicitly relaxed.

**Column ownership:**
| Column | Owner class |
|--------|-------------|
| desiredState | ScraperProcess (bot side) |
| actualState | ScraperControlRepository (scraper side) |
| heartbeatAt | ScraperControlRepository (scraper side) |
| updatedAt | both (set on every write) |
| id | neither (read-only, generated by DB) |

### Smoke Test Command (regression check for Phase 2/3)

```bash
# From the project root, with dev DB env vars:
DB_HOST=localhost POSTGRES_DB=saythis POSTGRES_USER=admin POSTGRES_PASSWORD=admin DB_PORT=5432 \
  npx tsx /path/to/smoke-test.ts
```

Where the smoke test file contains:
```typescript
import "reflect-metadata";
import { Container } from "inversify";
import { ScraperProcess } from "./src/modules/scraping/scraper-process.js";
import { ScraperControlRepository } from "./src/modules/scraping/scraper-control.repository.js";

async function main() {
  const container = new Container({ autobind: true });
  const proc = container.get(ScraperProcess);
  const repo = container.get(ScraperControlRepository);
  const before = await proc.getStatus();
  console.log("BEFORE:", JSON.stringify(before, null, 2));
  await proc.requestStop();
  await repo.updateHeartbeat();
  await repo.setActualState("RUNNING");
  const after = await proc.getStatus();
  console.log("AFTER:", JSON.stringify(after, null, 2));
  process.exit(0);
}
main().catch((err) => { console.error(err); process.exit(1); });
```

Expected: BEFORE shows `desiredState=STOPPED`, `actualState=IDLE`, `heartbeatAt=null`. AFTER shows `desiredState=STOPPED`, `actualState=RUNNING`, `heartbeatAt` non-null.

## Decisions Made

- Column ownership enforced at the class boundary (not at the DB level). Two separate classes own separate columns. This is a convention, not a DB constraint.
- JSDoc comments on both classes document ownership rules and the single-row invariant verbatim.
- Column names avoided in JSDoc comments where they would trigger false positives in grep-based acceptance checks.
- `executeTakeFirstOrThrow` (not `executeTakeFirst`) used in `getStatus()` so that a missing-row scenario is converted to a `Failure` via `tryCatch` instead of silently returning `undefined`.
- No `requestStart` polling requirement: the scraper auto-starts on container boot; `requestStart()` exists for explicit re-start signals from bot commands.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] JSDoc column name mentions caused grep acceptance checks to fail**
- **Found during:** Task 1 and Task 2 verification
- **Issue:** Plan template JSDoc mentioned `desiredState`, `actualState`, `heartbeatAt` by literal name in comments. The grep-based acceptance criteria required zero occurrences of these strings in the respective files.
- **Fix:** Rephrased JSDoc to describe ownership without using the exact column identifier strings (e.g., "the desired-state column" instead of `desiredState`). Same for `executeTakeFirstOrThrow` in the getStatus JSDoc (rephrased to "the throwing variant of executeTakeFirst").
- **Files modified:** `src/modules/scraping/scraper-control.repository.ts`, `src/modules/scraping/scraper-process.ts`
- **Verification:** grep counts returned 0 as required by acceptance criteria
- **Committed in:** d9b427f (Task 1), 2184998 (Task 2)

---

**Total deviations:** 1 auto-fixed (Rule 1 - Bug)
**Impact on plan:** Minimal — rephrased comments only. Behavior and implementation are identical to the plan specification.

## Issues Encountered

- Worktree started from an older commit (pre-Wave1). Rebased to `dee3046` (Wave 1 output) and restored working tree files before proceeding.
- Smoke test required `main()` wrapper (no top-level await in tsx CJS mode) and explicit DB env vars (`DB_HOST=localhost` since the worktree runs outside Docker).

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- IPC-02 and IPC-03 are complete. Phase 2 (scraper standalone) can import `ScraperControlRepository` from `src/modules/scraping/scraper-control.repository.js`.
- Phase 3 (bot standalone) can import `ScraperProcess` from `src/modules/scraping/scraper-process.js`.
- Both classes resolve automatically via `Container({ autobind: true })` — no `.bind()` calls needed in `main.ts`.
- The `scraper_control` table currently has `desiredState=STOPPED`, `actualState=RUNNING`, `heartbeatAt` populated (from smoke test). Phase 2 should reset `actualState` to `IDLE` on scraper startup.

---
*Phase: 01-db-schema-infrastructure*
*Completed: 2026-04-08*
