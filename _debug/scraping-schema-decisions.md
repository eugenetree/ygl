# Scraping Pipeline — Overview and Schema Decisions

Self-contained design doc for the YouTube captions scraping pipeline. Covers
the current flow, schema, and an open discussion about consolidating tables.

---

## 1. Project context

The system scrapes YouTube to build a searchable index of video captions.
Captions are persisted in Postgres and synced to Elasticsearch for full-text
search.

The scraping side (this doc's focus) is a multi-stage pipeline that:

1. Takes a seed list of search queries.
2. For each query, finds candidate channels.
3. For each channel, fetches metadata.
4. For each channel, lists its videos.
5. For each video, fetches metadata + captions (auto + manual).
6. Optionally runs transcription for videos that have only manual captions.

YouTube data is fetched via `yt-dlp` (wrapped in
[`youtube-api`](../src/modules/youtube-api)).

---

## 2. Pipeline flow

Four sequential stages, plus an async transcription branch:

```
seed: searchChannelQueries
       │
       ▼
┌────────────────────────────┐
│ STAGE 1: CHANNEL_DISCOVERY │   query → channel ids
│ worker: SearchChannelQueriesWorker
│ use-case: FindChannelsUseCase
│ writes:   channelEntries (id, queryId)
│ enqueues: channelJobs
└────────────────────────────┘
       │
       ▼
┌────────────────────────────┐
│ STAGE 2: CHANNEL           │   channel id → full channel metadata
│ worker: ChannelEntriesWorker
│ use-case: ProcessChannelEntryUseCase
│ writes:   channels (full row)
│ enqueues: videoDiscoveryJobs
└────────────────────────────┘
       │
       ▼
┌────────────────────────────┐
│ STAGE 3: VIDEO_DISCOVERY   │   channel → video ids
│ worker: ChannelsWorker
│ use-case: FindChannelVideosUseCase
│ writes:   videoEntries (id, channelId, availability)
│ enqueues: videoJobs (only if PUBLIC)
└────────────────────────────┘
       │
       ▼
┌────────────────────────────┐
│ STAGE 4: VIDEO             │   video id → metadata + captions
│ worker: VideoEntriesWorker
│ use-case: ProcessVideoEntryUseCase
│ writes:   videos, captions
│ enqueues: transcriptionJobs (only if MANUAL_ONLY captions)
└────────────────────────────┘

(async) transcriptionJobs ──▶ transcribe audio to backfill auto captions
```

The orchestrator
([`scraper.orchestrator.ts`](../src/modules/scraping/scraper.orchestrator.ts))
runs these stages **in sequence**, one at a time, with per-stage timeouts (5
min for stages 1–3, 1 hour for stage 4). It loops until the queue is exhausted
or a critical error occurs.

Lifecycle (start/stop, heartbeat) is handled in
[`lifecycle/`](../src/modules/scraping/lifecycle); a Telegram bot can
request start/stop via `requestedStatus` in the `scrapingProcess` table.

---

## 3. Code architecture

Each pipeline stage has the same 4-piece anatomy:

| component | role | example |
|---|---|---|
| **entry table** | "I saw this id" record (pre-hydration) | `channelEntries`, `videoEntries` |
| **jobs table** | queue + status | `channelDiscoveryJobs`, `channelJobs`, `videoDiscoveryJobs`, `videoJobs`, `transcriptionJobs` |
| **queue class** | DB wrapper: `enqueue`, `getNext`, `markAsSuccess/Failed` | `ChannelEntriesQueue`, `VideoEntriesQueue`, ... |
| **worker class** | pulls from queue, calls use-case, marks status | `ChannelEntriesWorker`, `VideoEntriesWorker`, ... |
| **use-case** | the actual business logic | `ProcessChannelEntryUseCase`, ... |

All `getNext` queries follow the same pattern:

```sql
UPDATE <jobs_table> SET status='PROCESSING'
WHERE id IN (
  SELECT id FROM <jobs_table>
  [JOIN domain_table ON ... -- for filter/sort]
  WHERE status='PENDING'
  ORDER BY <criteria>
  LIMIT 1
  FOR UPDATE SKIP LOCKED
)
```

Important: workers **do** join domain tables when picking work. For example,
[`channels.queue.ts`](../src/modules/scraping/scrapers/video-discovery/channels.queue.ts)
joins `channels` to filter by `videoCount`, `countryCode` and sort by
`subscriberCount`.

---

## 4. Schema reference (key tables only)

```
searchChannelQueries
  id, query, createdAt, updatedAt
    -- seeded list of search queries

channelEntries
  id, queryId, createdAt, updatedAt
    -- thin stub: a channel id discovered via a query

channels
  id, name, description, subscriberCount, viewCount, videoCount,
  countryCode, isFamilySafe, channelCreatedAt, username, isArtist,
  keywords, ... timestamps
    -- fully hydrated channel metadata

videoEntries
  id, channelId, availability, createdAt, updatedAt
    -- thin stub: a video id discovered for a channel
    -- availability ∈ ('PUBLIC', 'MEMBERS_ONLY')

videos
  id, title, duration, channelId, viewCount, thumbnail,
  languageCode, autoCaptionsStatus, manualCaptionsStatus, ... etc
    -- fully hydrated video metadata

captions
  id, videoId, type ('manual'|'auto'), startTime, endTime, text, ...

-- Job tables (one per pipeline stage):
channelDiscoveryJobs   id, searchQueryId, status, statusUpdatedAt, createdAt
channelJobs            id, channelId,     status, statusUpdatedAt, createdAt
videoDiscoveryJobs     id, channelId,     status, statusUpdatedAt, createdAt
videoJobs              id, videoId, channelId, status, skipCause,
                       statusUpdatedAt, createdAt
transcriptionJobs      id, videoId, status, statusUpdatedAt, createdAt

-- Status enums:
processing_status = ('PENDING', 'PROCESSING', 'SUCCEEDED', 'FAILED')
video_job_status  = processing_status ∪ ('SKIPPED')
video_job_skip_cause = ('MEMBERS_ONLY', 'GEO_RESTRICTED',
                        'AGE_RESTRICTED', 'PREMIERE')

-- Supporting tables:
channelVideosHealth          per-channel succeeded/failed streaks
channelVideosScrapeMetadata  per-channel discovery outcome (legacy?)
elasticCaptionsSync          ES sync state
scraperConfig                per-scraper enable/disable
scrapingProcess              process-level lifecycle (RUNNING/STOPPED/...)
```

Note the redundancy:
- `channelEntries` carries only `id` + `queryId` — everything else lives on `channels`.
- `videoEntries` carries only `id`, `channelId`, `availability` — everything else lives on `videos`.
- The five `*Jobs` tables have nearly identical shapes, differing only in payload column and (for `videoJobs`) the `skipCause` field.

---

## 5. Open question A — entries tables: drop or keep?

`channelEntries` and `videoEntries` exist as discovery-time stubs holding just
an id (+ a few extras), created before the full metadata fetch.

### Option A — drop entries entirely

- Move `queryId` onto `channels` (e.g. `discoveredViaQueryId`).
- Move `availability` onto `videos`.
- Hydrated fields (`name`, `subscriberCount`, `title`, ...) become **nullable**
  until the worker hydrates them.
- Every consumer must filter `WHERE hydrationStatus='SUCCEEDED'` (or query a
  view).

**Pros**
- Fewest tables.

**Cons**
- Nullability blooms across domain tables.
- Frontend, search, analytics all need the hydration filter — easy to forget.

### Option B — keep entries as discovery stubs

- `channelEntries` / `videoEntries` hold the row from discovery onwards.
- `channels` / `videos` only get rows when fully hydrated.

**Pros**
- Hydrated tables stay clean — all fields `NOT NULL`, no filtering.
- Two-step write is contained to the worker.

**Cons**
- One extra table per entity.

This decision is independent of the jobs-table decision below.

---

## 6. Open question B — separate jobs tables vs built-in status fields

### Option X — built-in status on domain tables

Status columns live on `channels`, `videos`, `searchChannelQueries`, etc. The
`*Jobs` tables go away.

**Pros**
- Fewer tables (3 instead of 5–7).
- All state for an entity in one row.
- Refetch is just `UPDATE ... SET status='PENDING'`.
- Worker `getNext` becomes a single-table UPDATE — no JOIN with domain table
  for filtering.

**Cons**
- Status columns multiply per entity:
  - `channels` would carry `hydrationStatus` + `videoDiscoveryStatus`.
  - `videos` would carry `hydrationStatus` + `transcriptionStatus`.
  - Each new pipeline stage adds another column pair.
- Hydrated metadata fields become nullable.
- Stage-specific fields (e.g. `skipCause` — meaningful only for video
  hydration) clutter domain tables.
- Conflates "what we have" with "what we're doing about it."
- Workers `UPDATE ... FOR UPDATE SKIP LOCKED` on the same rows the frontend
  and search read. PostgreSQL MVCC means readers aren't blocked, but writers
  (e.g. metadata refetch) contend with the worker.
- Pipeline-level features (retries, attempts, lastError) bolt onto domain
  tables.
- Adding a stage requires altering a domain table.

### Option Y — separate jobs tables (today's shape)

One job table per pipeline stage, as listed in §4.

**Pros**
- Domain tables stay clean — pure entity data, no pipeline state.
- Stage-specific fields live where they belong:
  - `videoJobs.skipCause` (already exists).
  - Future transcription fields (provider, language, cost, ...).
- Adding a stage = new table, zero domain-schema churn.
- Per-stage features (e.g. retry policy specific to transcription) are trivial
  to add.
- Pipeline observability isolated to pipeline tables — easier to monitor,
  audit, and admin.

**Cons**
- More tables.
- Code duplication across queue files (~400 lines of near-identical
  `enqueue` / `getNext` / `markAsSuccess` / `markAsFailed`). Acceptable here.
- Worker queries already JOIN domain tables to filter/sort (e.g.
  `videoDiscoveryJobs` joins `channels` for `videoCount`, `countryCode`,
  `subscriberCount`). With built-in status, the same logic is a single-table
  UPDATE — slightly cleaner.
- An extra JOIN to ask "what stage is this entity in?" — rarely needed by
  domain consumers.

### Deciding factor

`videoJobs.skipCause` already exists, and transcription is likely to grow more
stage-specific fields (provider, language, cost, retry policy, audio URL).
Once one stage has stage-specific fields, built-in status forces nullable,
mostly-irrelevant columns onto domain tables. Separate jobs tables keep that
contained.

The "workers stay isolated from domain tables" argument doesn't really apply
here — the cross-table read happens either way. The case for separate jobs
tables rests on **stage-specific fields** and **clean separation of
concerns**, not on query isolation.

---

## 7. Refetch / re-run semantics

Both options support refetch via the same pattern:

```sql
UPDATE <table> SET status='PENDING' WHERE <condition>
```

What you give up by overriding (vs inserting a new job row):
- "When did we last run this?" — keep `statusUpdatedAt`.
- "How often has this failed?" — gone unless you add `failureCount`.
- Per-run timing/diagnostics history — gone.

For most internal scrapers, override is fine.

If you want metadata-change history (e.g. how `subscriberCount` evolved),
that's a separate concern with a separate solution: an append-only
`channelMetadataSnapshots` table written on each refetch. Orthogonal to the
schema decision above.

---

## 8. Recommendation

- **Jobs tables:** keep separate per stage (Option Y).
- **Entries tables:** decide A vs B based on how much you value clean
  hydrated tables vs minimum table count.
- **Domain tables** (`channels`, `videos`, `searchChannelQueries`) stay free
  of pipeline state regardless.

Other cleanup ideas surfaced during the review (independent of the above):

- The five queue classes can share a generic `JobsQueue<T>` base to remove
  duplication, even with separate tables — the user has chosen to accept the
  duplication for now.
- `ORDER BY random()` in the queues is marked as temporary — switch to
  `ORDER BY createdAt` once seeded data is large enough.
- A failed worker currently kills the orchestrator — most worker errors should
  mark-and-continue; only DB/infra errors should escalate.
- `channelVideosScrapeMetadata` may be legacy — verify whether it's still
  populated/read.
