# Plan: Reliable Test Suite for Scraping Flow

**TL;DR.** Don't assert on tables; assert through the same queues/repositories production uses, and only drop to raw SQL for invariants the repo doesn't expose (status, priority, skipCause, FK columns). Build a 3-tier pyramid using existing pg-mem + node:test setup: many fast use-case + real DB tests, a few per-stage worker tests, one full-orchestrator smoke test with mocked YT clients. Add testcontainers later only for SKIP LOCKED, LISTEN/NOTIFY, migrations.

---

## Coverage analysis — what exists vs. what doesn't

### Currently covered (8 test files)

| Layer | File | What it proves |
|---|---|---|
| Unit | [channel-priority.calculator.test.ts](../src/modules/scraping/channel-priority/channel-priority.calculator.test.ts) | Score math |
| Unit | [caption-analysis.service.test.ts](../src/modules/scraping/scrapers/video/use-cases/process-video-entry/caption-analysis.service.test.ts) | Caption classification |
| Unit | [process-video-entry.use-case.test.ts](../src/modules/scraping/scrapers/video/use-cases/process-video-entry/process-video-entry.use-case.test.ts) | Stage-4 use case (mocked deps) |
| Unit | [process-scraper-failure.use-case.test.ts](../src/modules/scraping/error-handling/process-scraper-failure.use-case.test.ts) | Failure → telegram |
| Unit | [yt-api-get-video.unit.test.ts](../src/modules/youtube-api/yt-api-get-video.unit.test.ts) | YT API parsing |
| Integration (pg-mem) | [video-entries.queue.test.ts](../src/modules/scraping/scrapers/video/video-entries.queue.test.ts) | One queue's I/O |
| Integration (pg-mem) | [push-channel.use-case.test.ts](../src/modules/scraping/push-channel/push-channel.use-case.test.ts) | Manual boost path |
| Live | [yt-api-get-video.test.ts](../src/modules/youtube-api/yt-api-get-video.test.ts) | YT API contract (slow) |

### Gaps, ranked by risk

1. **Stage 1 (channel discovery)** — `FindChannelsUseCase`, `SearchChannelQueriesWorker`, `channelDiscoveryJobs` queue, seeder: zero integration coverage. *This is exactly the example raised.*
2. **Stage 2 (channel)** — `ProcessChannelEntryUseCase`, `ChannelEntriesWorker`, `channelJobs` queue: zero integration coverage.
3. **Stage 3 (video discovery)** — `FindChannelVideosUseCase`, `ChannelsWorker`, the `videoCount<10000` + country-code filter, `CHANNEL_NOT_FOUND` skip: zero coverage.
4. **Stage 4 worker + queue** — use case has unit test, but `VideoEntriesWorker` orchestration (mark succeeded/failed, skip causes `MEMBERS_ONLY`/`GEO_RESTRICTED`/`AGE_RESTRICTED`/`PREMIERE`) and `videoJobs` queue ordering: untested.
5. **Priority end-to-end** — calculator is unit-tested, but the chain *score → `channelJobs.priority` → `getNext()` order* is not. Boosted-channel ordering only loosely tested.
6. **Caption → transcription** — manual-only captions enqueueing `transcriptionJobs`: untested.
7. **Orchestrator** — 4-stage loop, per-stage time budgets, `WorkerStopCause.EMPTY` termination, error escalation: untested.
8. **Lifecycle** — `ScraperCommandListener` (`LISTEN/NOTIFY`), heartbeat, start/stop: untested. Cannot test with pg-mem.
9. **Concurrency** — `SELECT … FOR UPDATE SKIP LOCKED` is silently stripped by pg-mem; never actually exercised.
10. **Migrations** — no test that they apply cleanly.
11. **Stats / error-notifications integration** — only unit-level.

---

## Direct answer: assert on tables, or something else?

Mix, in this priority order:

1. **Default to repository/queue APIs** for assertions. They are the production seam, so the test stays valid through schema changes. Example: after `FindChannelsUseCase.execute(query)`, assert via `channelEntryRepo.findById(...)` and `channelEntriesQueue.getNext(...)` rather than `SELECT * FROM channelEntries`.
2. **Drop to raw Kysely `SELECT`** only for properties the repo intentionally doesn't expose:
   - exact `status` value (`PENDING` / `PROCESSING` / `SUCCEEDED` / `FAILED` / `SKIPPED`)
   - `priority` numeric value at insert
   - `skipCause` strings
   - foreign-key integrity (the right `queryId` / `channelId` got attached)
3. **Never assert on raw rows when a public method already returns the same fact** — this is what makes table tests brittle.

---

## Recommended structure

```
src/modules/scraping/
  scrapers/
    channel-discovery/
      use-cases/find-channels.use-case.test.ts          ← NEW (use-case + pg-mem)
      search-channel-queries.queue.test.ts              ← NEW (queue I/O)
      search-channel-queries.worker.test.ts             ← NEW (worker w/ mocked use case)
    channel/                  ← same trio
    video-discovery/          ← same trio
    video/
      video-entries.queue.test.ts                       ← exists
      video-entries.worker.test.ts                      ← NEW
  channel-priority/
    channel-priority.e2e.test.ts                        ← NEW (score → ordering)
  scraper.orchestrator.test.ts                          ← NEW (4-stage smoke)

src/db/testing/
  pg-mem-db.ts            ← NEW: shared harness (extracted from existing 2 tests)
  fixtures/
    channels.ts           ← NEW: insertChannel(), insertChannelJob()
    videos.ts
    queries.ts
```

Naming: keep `*.test.ts` co-located. Suffixes only when needed: `*.unit.test.ts` (mocks only), `*.e2e.test.ts` (orchestrator-level).

---

## DB strategy recommendation

**Two tiers, clear boundary:**

- **Tier 1 — pg-mem** for everything you'd write today. Fast (<100ms/test), hermetic, no Docker. Covers ~90% of needs. Existing pattern works — formalize it.
- **Tier 2 — testcontainers (real Postgres)** only for:
  - Concurrency tests around `FOR UPDATE SKIP LOCKED` (run two `getNext()` in parallel, prove they don't return the same row)
  - `ScraperCommandListener` + Postgres `LISTEN/NOTIFY`
  - Migration smoke test (apply all migrations on empty DB)
  - One full-pipeline e2e to back the pg-mem orchestrator test

Don't reach for testcontainers until Tier 1 is built out.

---

## Phased plan

### Phase 1 — Harness extraction (foundation)
1. Extract pg-mem boilerplate from existing 2 tests to `src/db/testing/pg-mem-db.ts`. Expose `createTestDb({ tables: [...] })` returning `{ db, pgMem }`. Bake in: `gen_random_uuid` registration, the `FOR UPDATE OF`/`SKIP LOCKED` regex strip, `CamelCasePlugin`.
2. Create per-table fixture helpers in `src/db/testing/fixtures/` — typed inserters that return the inserted row.
3. Refactor the 2 existing pg-mem tests onto the harness — proves it's drop-in.

### Phase 2 — Stage 1 integration tests (the example)
4. `find-channels.use-case.test.ts`: mock `YoutubeApiSearchChannelsViaVideos`, run real `ChannelEntryRepository` + `ChannelEntriesQueue` against pg-mem. Cases:
   - Happy path: search returns 3 channels → 3 rows in `channelEntries`, 3 PENDING rows in `channelJobs`, each with the right `priority` from `ChannelPriorityService`
   - Dedup: re-running same query doesn't double-insert
   - Empty result: query is marked done, no jobs enqueued
   - Use `channelEntriesQueue.getNext()` to assert the jobs exist (not raw SELECT); use raw SELECT only to check `status='PENDING'` and `priority` value
5. `search-channel-queries.queue.test.ts`: mirror of `video-entries.queue.test.ts`. enqueue / getNext / markSucceeded / markFailed / ordering by createdAt.
6. `search-channel-queries.worker.test.ts`: mock the use case; verify the worker calls `getNext` → use case → `markSucceeded`/`markFailed`, exits with `EMPTY` when no jobs.

### Phase 3 — Stages 2, 3, 4 (parallel after Phase 2)
7. Replicate the trio for the channel stage.
8. Replicate the trio for the video-discovery stage. Add a test for the country-code + `videoCount` filter and `CHANNEL_NOT_FOUND` skip.
9. Add `video-entries.worker.test.ts`. Add use-case integration cases for each `skipCause` (`MEMBERS_ONLY` / `GEO_RESTRICTED` / `AGE_RESTRICTED` / `PREMIERE`) and the manual-only-captions → `transcriptionJobs` enqueue.

### Phase 4 — Cross-cutting
10. `channel-priority.e2e.test.ts`: insert N channels with varying scores, run `RecalculatePriorityUseCase`, then call `channelEntriesQueue.getNext()` repeatedly — assert returned order matches descending score. Also seed a boosted channel and prove it comes first.
11. `scraper.orchestrator.test.ts`: smoke test. Mock all external clients. Seed 1 query → run orchestrator with short time budgets → assert eventual rows in `videos`, `captions`, `videoJobs(status=SUCCEEDED)`. Stop on `QUEUE_EXHAUSTED`.

### Phase 5 — Real-Postgres tier (optional, do later)
12. Add `@testcontainers/postgresql`. Build a `createRealTestDb()` helper that runs migrations against the container. Port the orchestrator smoke test to it as `*.real.e2e.test.ts`. Add a dedicated `skip-locked.test.ts` that opens 2 connections and proves only one gets the row.
13. Add `scraper-command.listener.test.ts` (LISTEN/NOTIFY).

---

## Relevant files

- [video-entries.queue.test.ts](../src/modules/scraping/scrapers/video/video-entries.queue.test.ts) — template for queue tests; harness lives here today
- [push-channel.use-case.test.ts](../src/modules/scraping/push-channel/push-channel.use-case.test.ts) — template for use-case + real DB tests
- [find-channels.use-case.ts](../src/modules/scraping/scrapers/channel-discovery/use-cases/find-channels.use-case.ts) — Phase 2 first target
- [search-channel-queries.queue.ts](../src/modules/scraping/scrapers/channel-discovery/search-channel-queries.queue.ts)
- [scraper.orchestrator.ts](../src/modules/scraping/scraper.orchestrator.ts) — Phase 4 e2e target
- [src/db/types.ts](../src/db/types.ts) — `Database` interface used by pg-mem schema bootstrap
- [archive/SCRAPING_FLOW.md](../archive/SCRAPING_FLOW.md) — flow reference
- [docs/prd-scraper-architecture-refactor.md](./prd-scraper-architecture-refactor.md) — explains worker/use-case split that makes this testable

## Verification

1. `npm test` runs all `src/**/*.test.ts` via `node --test --import tsx` (already wired in `package.json`).
2. After Phase 1: existing 2 pg-mem tests still pass on the new harness (zero behavior change).
3. After Phase 2: ≥3 new test files for channel-discovery, all green; coverage of `find-channels.use-case.ts` branches by manual review of cases.
4. After Phase 3: every stage has the trio (queue, use-case, worker). `npx tsc --noEmit` clean.
5. After Phase 4: orchestrator test produces expected end-state rows in pg-mem within a reasonable run.
6. Phase 5: `docker ps` shows ephemeral postgres; `npm test` (or `npm run test:real`) green.

## Decisions

- **In scope:** Tier-1 pg-mem harness, integration tests for all 4 stages at use-case + queue + worker level, one orchestrator smoke test, priority e2e.
- **Out of scope (for now):** testcontainers, LISTEN/NOTIFY tests, migration tests, real-Postgres concurrency tests — Phase 5.
- **Assertion style:** repositories/queues first; raw `SELECT` only for `status`, `priority`, `skipCause`, FK columns.
- **Test runner:** keep `node:test` (no Vitest/Jest migration).
- **Mock boundary:** YouTube API client + yt-dlp client. Everything else real (DB, repos, queues, services).

## Further considerations

1. **Priority-ordering tests location** — single dedicated `channel-priority.e2e.test.ts` using real queues covers the cross-cutting contract in one place. Per-queue tests stick to FIFO/createdAt ordering.
2. **Time-based logic in orchestrator (5min/1h budgets)** — inject a clock/`now()` provider so the e2e test can advance virtual time. If invasive, accept short real budgets (e.g. 100ms) for the test.
3. **pg-mem schema source** — keep hand-coded but centralize in the harness. Running real migrations on pg-mem usually breaks on dialect features; true migration coverage belongs in Phase 5.
