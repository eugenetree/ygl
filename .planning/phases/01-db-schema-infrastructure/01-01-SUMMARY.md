---
phase: 01-db-schema-infrastructure
plan: "01"
subsystem: database
tags: [kysely, postgresql, migration, typescript, types]

# Dependency graph
requires: []
provides:
  - "scraper_control PostgreSQL table (uuid PK, desiredState, actualState, heartbeatAt, updatedAt)"
  - "ScraperControlRow interface in src/db/types.ts"
  - "DesiredScraperState union type (STOPPED | KILLED | RUNNING)"
  - "ActualScraperState union type (IDLE | STARTING | RUNNING | STOPPING | STOPPED | ERROR)"
  - "ScraperControlSelectable type alias"
  - "scraperControl registered in Database interface"
affects:
  - 01-02
  - scraper-process
  - scraper-control-repository

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Kysely migration with CamelCasePlugin: createTable uses camelCase, plugin translates to snake_case in SQL"
    - "Single-row IPC table seeded in migration up() with object literal (not array)"
    - "Union types (not enums) for state columns stored as text in PostgreSQL"
    - "Generated<> wrapper for uuid PK and timestamp columns with DB defaults"

key-files:
  created:
    - "src/db/migrations/1775599417586-create-scraper-control.ts"
  modified:
    - "src/db/types.ts"

key-decisions:
  - "State values stored as text (not PostgreSQL enum) - avoids separate enum migration, mirrors scraperConfig pattern"
  - "heartbeatAt is nullable (no notNull) - seed row has no heartbeat yet, NULL is valid initial state"
  - "DesiredScraperState includes RUNNING value even though IPC-01 only mentions STOPPED/KILLED - needed for requestStart() in Plan 02"
  - "Seed row values: desiredState=STOPPED, actualState=IDLE, heartbeatAt=NULL, updatedAt=now()"

patterns-established:
  - "Migration: use npm run db:migration:create-new to generate timestamp prefix via Date.now()"
  - "Single-row control table: seed exactly one row in up(), down() drops table only"
  - "State types: define union type in types.ts, reference in row interface field (not plain string)"

requirements-completed:
  - IPC-01

# Metrics
duration: 18min
completed: 2026-04-08
---

# Phase 1 Plan 01: DB Schema + Infrastructure Summary

**Kysely migration creates `scraper_control` PostgreSQL table with single seeded IPC row, plus full TypeScript union types and `ScraperControlRow` registered in `Database` interface**

## Performance

- **Duration:** 18 min
- **Started:** 2026-04-08T01:04:00Z
- **Completed:** 2026-04-08T01:22:00Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Created `src/db/migrations/1775599417586-create-scraper-control.ts` with `up()` (createTable + seed row) and `down()` (dropTable)
- Migration verified: `scraper_control` table exists with exactly 1 row (`STOPPED/IDLE/NULL`)
- Extended `src/db/types.ts` with `DesiredScraperState`, `ActualScraperState`, `ScraperControlRow`, `ScraperControlSelectable`, and `scraperControl` in `Database`
- TypeScript project compiles cleanly with zero errors

## Task Commits

Each task was committed atomically:

1. **Task 1: Create scraper_control migration file** - `aeca5bb` (feat)
2. **Task 2: Register scraperControl types in src/db/types.ts** - `807ea65` (feat)

## Files Created/Modified

- `src/db/migrations/1775599417586-create-scraper-control.ts` - Kysely migration: creates scraperControl table with uuid PK, desiredState/actualState (text NOT NULL), heartbeatAt (timestamptz nullable), updatedAt (timestamptz NOT NULL default now()); seeds one row with STOPPED/IDLE/NULL
- `src/db/types.ts` - Added DesiredScraperState and ActualScraperState union types, ScraperControlRow interface, scraperControl field in Database, ScraperControlSelectable type alias

## Decisions Made

- Used `text` columns (not PostgreSQL enum) for state values - consistent with `scraperConfig` which uses plain text; avoids a separate enum migration
- `heartbeatAt` is nullable - the seed row has no heartbeat yet; NULL is the correct initial state
- `DesiredScraperState` includes `"RUNNING"` beyond the IPC-01 spec (`STOPPED|KILLED`) because `ScraperProcess.requestStart()` in Plan 02 writes `desiredState = "RUNNING"`
- Seed values match plan exactly: `desiredState="STOPPED"`, `actualState="IDLE"`, `heartbeatAt=null`

## Deviations from Plan

None - plan executed exactly as written.

Note: The migration runner (`npm run db:migration:run`) requires Node.js 21+ due to `import.meta.dirname` usage in `src/db/scripts/run-migrations.ts`. Running from the local shell with Node.js 18 fails. Verified by running migration inside the Docker app container (Node 22) and confirmed the table was created correctly. This is a pre-existing limitation of the project's migration script, not introduced by this plan.

## Issues Encountered

- `npm run db:migration:run` fails under Node.js 18 (worktree shell default) because the migration runner uses `import.meta.dirname` (Node 21+). Resolution: switched to Node 22 via nvm (`nvm use 22`) to run the migration from the host. Migration executed successfully and DB probe confirmed correct table and seed row.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Plan 02 can now import `ScraperControlRow`, `ScraperControlSelectable`, `DesiredScraperState`, `ActualScraperState` from `src/db/types.js` and query `scraperControl` via `dbClient` with full type safety.

The single seeded row (`STOPPED/IDLE/NULL`) is the initial state that `ScraperProcess` and `ScraperControlRepository` (Plan 02) will read and update via `updateTable` exclusively.

---
*Phase: 01-db-schema-infrastructure*
*Completed: 2026-04-08*
