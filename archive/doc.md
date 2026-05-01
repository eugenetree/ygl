# YouTube Pipeline — Architecture Overview

## Context

Pipeline processing YouTube data through stages: search queries → channel entries → channels → video entries → videos → per-video processing stages. Scale: ~50M channels, ~100M videos. Throughput: hundreds of ops/sec across all stages. Each stage either runs once (terminal) or repeats periodically (recurring).

## Core pattern: DB-backed pull queue

Postgres holds both entity data and job state. Workers claim work via partial-index queries with `SKIP LOCKED`. No separate queue system.

### Why not BullMQ / RabbitMQ / Kafka

**Pros of queues**: built-in retry, delay primitives, push semantics, established tooling.

**Cons for this workload**:
- Work items are permanent rows that need queryability — queues don't query
- Priority changes don't propagate to already-queued jobs
- Dynamic refresh cadences (per-entity, per-tier) don't fit queue semantics
- Skip / boost / cancel operations require maintaining state in two places
- Auto-rescheduling delayed messages can be lost silently

**Rule**: Queues are for transient events without a permanent home. This pipeline is recurring state on permanent rows.

### Why not orchestrator + jobs table

A separate process scanning entities and inserting job rows.

**Pros**: clean separation, materialized work list.

**Cons**: doubles writes, adds latency, needs deduplication logic, single point of failure, more state to keep in sync.

**Rule**: Don't add an orchestrator if eligibility is one indexed comparison. The entity table itself is the work list.

## Schema layout: hybrid Pattern A + satellite tables

Use **Pattern A** (columns on entity) when:
- The entity's whole purpose is one terminal stage (entries → fetch)
- Stages are universal with no stage-specific data

Use **satellite tables** (separate `<entity>_<stage>_jobs`) when:
- Stage has stage-specific typed data
- Stage is conditional (applies to subset of entities)
- Stage has different operational characteristics (long-running, GPU, etc.)

### Pattern A pros/cons

**Pros**: single source of truth, free job creation on entity insert, simple cross-stage queries, fewer tables to operate.

**Cons**: wide rows at scale, vacuum pressure shared across stages, schema migrations on hot table, NULL columns for sparse stages.

### Satellite tables pros/cons

**Pros**: schema isolation per stage, vacuum isolation, stage-specific typed columns, easier to drop/add stages, hot/cold separation.

**Cons**: explicit job row creation needed (use triggers), cross-stage queries become joins, more tables to operate, propagation logic touches multiple tables.

**Storage note**: Pattern A is actually cheaper for storage when sparsity is moderate (20%+). NULLs in Postgres are nearly free. Satellite tables save storage only at high sparsity (<5%). Pick satellites for operational reasons, not storage.

## Final table structure

```
search_queries (Pattern A — recurring stage)
├── status, next_at, started_at, attempts, error, last_at, priority_tier

channel_entries (Pattern A — terminal fetch stage)
├── youtube_channel_id, discovered_via_query_id, channel_name
├── status, next_at, ..., priority_tier
└── channel_id (populated on success)

channels (data only)
├── channel_info_refresh_jobs (satellite — recurring)
└── channel_video_discovery_jobs (satellite — recurring)

video_entries (Pattern A — terminal fetch stage)
├── youtube_video_id, channel_id
├── status, next_at, ..., priority_tier
└── video_id (populated on success)

videos (data only)
├── video_metadata_refresh_jobs (satellite — recurring)
├── video_lang_detect_jobs (satellite — conditional)
├── video_captions_jobs (satellite — conditional)
└── other per-stage satellites as needed
```

## Standard column skeleton

Every job table or job-column-group has:

| Column | Purpose |
|---|---|
| `status` | `ready` / `running` / `failed` / `skipped` / `pending` / `done` |
| `next_at` | When eligible for claim. Drives partial index. |
| `started_at` | Set on claim, refreshed by heartbeats |
| `attempts` | Retry counter |
| `error` | Last error message |
| `last_at` | Set on success only — for audit / UI |
| `priority_tier` | Smallint, drives claim ordering |
| `status_updated_at` (optional) | For ops queries: "stuck how long" |

Don't conflate `next_at` with `last_at`/`processed_at`. `next_at` is operational (drives scheduling). `last_at` is informational (audit).

## Indexes per stage

```sql
-- Claim index
CREATE INDEX <table>_claim ON <table> (priority_tier DESC, next_at)
  WHERE status = 'ready';

-- Sweeper index for stuck rows
CREATE INDEX <table>_running ON <table> (started_at)
  WHERE status = 'running';
```

Partial indexes stay small regardless of total row count.

## Claim pattern

```sql
WITH claimed AS (
  SELECT <id> FROM <table>
  WHERE status = 'ready' AND next_at <= now()
  ORDER BY priority_tier DESC, next_at
  LIMIT <batch>
  FOR UPDATE SKIP LOCKED
)
UPDATE <table> SET status='running', started_at=now()
FROM claimed WHERE <table>.<id> = claimed.<id>
RETURNING ...;
```

**Batch size**: 1 for long jobs (video discovery, transcription). 50 when downstream API accepts batched IDs (metadata refresh batches `videos.list`). Concurrency comes from worker count, not batching.

## Failure handling

```sql
-- Success
SET status='ready', next_at=now()+<interval>, error=NULL, attempts=0, last_at=now()

-- Failure
SET status=CASE WHEN attempts+1>=<max> THEN 'failed' ELSE 'ready' END,
    next_at=now()+(interval '1 min' * power(2, attempts)),
    error=$1, attempts=attempts+1

-- Terminal stages: use 'done' instead of resetting to 'ready' on success
```

## Crash recovery

**Sweeper** (every minute, per stage):
```sql
UPDATE <table> SET status='ready'
WHERE status='running' AND started_at < now() - <threshold>;
```

**Heartbeats** for long jobs (every 60s while running):
```sql
UPDATE <table> SET started_at=now()
WHERE <id>=$1 AND status='running';
```

Heartbeats let sweeper threshold stay tight (5 min) regardless of actual job duration.

## Priority

**Tiered, not continuous.** Compute small smallint (0-4) from inputs:

```python
def compute_tier(subs, manual_priority, ...):
    if manual_priority: return 4
    if subs > 10M: return 3
    if subs > 1M: return 2
    if subs > 100K: return 1
    return 0
```

Cache the tier on the source entity (`channels.cached_tier`). On change, propagate to children's job tables — but **only when tier actually crosses a threshold**:

```python
new_tier = compute_tier(...)
if new_tier != entity.cached_tier:
    UPDATE entity SET cached_tier = new_tier
    for table in CHILD_JOB_TABLES:
        UPDATE table SET priority_tier = new_tier
        WHERE <fk> = entity.id AND status='ready' AND priority_tier != new_tier
```

The "did tier change" check is critical. Without it, every refresh churns millions of child rows.

**Pros of tiers vs continuous score**: rare propagation, shallow indexes, clear operational meaning.

**Cons**: less precise ordering within a tier.

**Boost / preempt** ("process this NOW, before existing due work"): backdate `next_at` to `'1970-01-01'`. Don't add a separate boost mechanism unless boosting is a recurring concept.

## Stage handoff

Stages communicate via `UPDATE` on the next stage's table (or column group). No queue messages, no orchestrator.

**Required downstream stages**: trigger on entity insert auto-creates job row.

**Optional downstream stages**: upstream worker decides whether to INSERT the job row based on conditions (e.g., create lang_detect job only if language is NULL after metadata fetch).

## Refresh cadences

Tier-driven, not flat:

| Tier | Channel info | Video metadata |
|---|---|---|
| 4 (priority) | weekly | every few days |
| 3 (10M+ subs) | weekly | weekly |
| 2 (1M+ subs) | monthly | monthly |
| 1 (100K+ subs) | quarterly | quarterly |
| 0 (small) | rarely / never | rarely / never |

Driven by YouTube API quota math, not by what feels fresh. Run quota math early.

## Done-row retention

**Recurring stages**: never delete. Row is the schedule. Status cycles forever.

**Terminal stages**: keep done rows by default. Add 90-day cleanup of `status='done'` rows when storage actually matters. Failed rows: keep longer or forever (operationally interesting).

**Pros of keeping**: idempotency by default, audit trail, easy reprocessing, consistent schema.

**Cons of keeping**: storage growth, larger PK indexes, table noise.

## Parallelism

Multiple stages can run in parallel on the same entity. Each stage is an independent state machine on its own column group / satellite table. Workers don't coordinate; they operate on disjoint columns.

Row-level locks during claim are sub-millisecond. SKIP LOCKED prevents blocking. No coordination needed.

## At-scale tuning (50M+ rows)

- `fillfactor=80` on hot tables — set BEFORE table grows large
- Aggressive autovacuum per-table (`autovacuum_vacuum_scale_factor=0.02`)
- PgBouncer in transaction pooling mode (workers × stages > 200 connections overwhelms Postgres)
- Monitor `count(*) WHERE status='ready' AND next_at <= now()` per stage (queue depth)
- Heartbeats on any stage with jobs >2 min
- Column ordering by alignment (8-byte first, then 4, 2, 1, variable-length last)

## Worker pools

One pool per stage. Each independently sized for:
- Concurrency (number of workers / async tasks)
- Quota allocation (YouTube API costs vary per endpoint)
- Sweeper threshold
- Heartbeat cadence

Pools must not share workers — different stages have different quota costs and operational profiles.

**Concurrency model**: 100 "workers" can be 4 processes × 25 async tasks each, not 100 separate processes. Lower connection count, simpler ops.

## Cloud migration (if/when)

Lift-and-shift, not rewrite:
- Postgres → managed (RDS / Cloud SQL / Aurora)
- Workers → containers (ECS Fargate / GKE / Cloud Run jobs)
- Don't switch to Lambda for hot loop (long-running, claim-driven, benefits from connection reuse)
- Don't switch to NoSQL (lose partial-index claim pattern, joins, queryability)

## When to revisit

Triggers to reconsider the architecture:
- Sustained claim throughput >5,000/sec across all stages (currently target hundreds)
- A stage genuinely needs multiple concurrent in-flight jobs per entity
- External systems need to consume pipeline events (add Kafka alongside, don't replace)
- Multi-region writes with low latency (consider CockroachDB / Spanner)
- Single Postgres instance can't hold the data (partition before sharding)

## Per-stage checklist

When adding a new stage:

1. Decide Pattern A or satellite based on stage characteristics
2. Add status column group or create satellite table with skeleton
3. Create claim partial index `(priority_tier DESC, next_at) WHERE status='ready'`
4. Create sweeper index `(started_at) WHERE status='running'`
5. Pick batch size (1 for long jobs, 50 for batchable APIs)
6. Implement worker: claim CTE → work → success/failure UPDATE
7. Add heartbeat if jobs >2 min
8. Add sweeper with threshold = 2-3× expected longest duration
9. Determine refresh cadence (or `done` for terminal)
10. Define handoff: what UPDATE on what table follows success
11. Add queue depth metric to monitoring
12. For required stages, add trigger to auto-create job rows on entity insert