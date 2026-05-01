YouTube Data Pipeline — Architecture Patterns
Context
A YouTube data pipeline with multiple stages of work that flow between entity types: search queries → channel IDs → channel info → video discovery → video metadata → conditional downstream processing (captions, language detection, etc.). Scale: ~50M channels, ~100M videos, ~50M unprocessed video entries at any given time. Throughput: hundreds of operations per second across all stages combined. Each stage has periodic refresh requirements (re-fetch channel subs monthly, re-fetch video metadata, etc.).
The decisions below were reached after weighing alternatives (separate job tables, BullMQ, Kafka, RabbitMQ, Lambda/serverless, NoSQL). Don't suggest those alternatives unless the user explicitly asks or describes a problem that genuinely warrants them. The patterns below were chosen deliberately.
Core architectural pattern: DB-backed pull queue with entity-as-job-state
Postgres is the source of truth for both entity data and job state. There is no separate jobs table per stage. Each entity table (channels, videos, video_entries, search_queries) carries job state columns directly for each stage of work that applies to it.
For each stage that operates on an entity, add a column group on the entity table:

<stage>_status — text, values: ready, running, failed, skipped, pending. Default depends on stage. pending means waiting for a precondition (e.g., language detection only becomes ready when metadata fetch reveals the language is unknown).
<stage>_error — text, last error message
<stage>_attempts — int, retry counter
<stage>_started_at — timestamptz, set on claim, refreshed by heartbeats
<stage>_next_at — timestamptz, when the row becomes eligible for claiming
<stage>_skip_reason — text, optional, populated when status is skipped

A stage transitions another stage by UPDATEing the next stage's columns on the same row (or on related rows). Example: video discovery worker bulk-inserts new videos with metadata_refresh_status='ready' and metadata_refresh_next_at=now(). That insert IS the fan-out — no job-creation step.
Indexing
For every stage on every entity, create a partial index on the claim predicate:
sqlCREATE INDEX <table>_<stage>_due
  ON <table> (<stage>_next_at)
  WHERE <stage>_status = 'ready';
And one for the sweeper:
sqlCREATE INDEX <table>_<stage>_running
  ON <table> (<stage>_started_at)
  WHERE <stage>_status = 'running';
Partial indexes stay small regardless of table size because they only contain rows in the relevant state. This is what makes the pattern scale.
For tables that need priority ordering (e.g., video_entries processed by channel sub count), add a priority_tier smallint column with a small number of discrete tiers (e.g., 0-4) computed from the underlying signal. Do not store raw subs counts as priority — tier crossings are rare events, raw counts drift constantly. The claim index becomes:
sqlCREATE INDEX <table>_claim
  ON <table> (priority_tier DESC, id)
  WHERE status = 'ready';
When a tier-determining signal changes (subs count refresh, manual priority flag), update related entity rows only when the tier actually changes:
pythonnew_tier = compute_tier(...)
if new_tier != cached_tier:
    UPDATE <child_table> SET priority_tier = $new
    WHERE parent_id = $id AND status = 'ready' AND priority_tier != $new
The "did tier actually change" check is critical — without it you'll thrash millions of rows on every refresh.
Claim pattern
Standard SELECT ... FOR UPDATE SKIP LOCKED claim, in a CTE that updates the row to running:
sqlWITH claimed AS (
  SELECT id FROM <table>
  WHERE <stage>_status = 'ready'
    AND <stage>_next_at <= now()
  ORDER BY <stage>_next_at  -- or (priority_tier DESC, id) for priority queues
  LIMIT <batch_size>
  FOR UPDATE SKIP LOCKED
)
UPDATE <table> t
SET <stage>_status = 'running', <stage>_started_at = now()
FROM claimed
WHERE t.id = claimed.id
RETURNING t.id, <other needed fields>;
SKIP LOCKED is non-negotiable. It's what makes concurrent workers not contend.
Batch size rule
Batch size matches what fits in one downstream operation, not what's convenient for Postgres:

Per-job duration < 1s and downstream API accepts batched IDs (YouTube allows 50 per videos.list/channels.list): batch 50, one API call per claim
Per-job duration is seconds to minutes with a 1:1 entity-to-API-call mapping: batch 1
Per-job duration is many minutes (e.g., video discovery for large channels): batch 1, always

Long jobs with batched claims cause head-of-line blocking, large crash blast radius, and uneven load. Concurrency comes from running more workers, not from batching.
Worker pools
One worker pool per stage, sized independently. Concurrency within a pool comes from async (asyncio, goroutines, etc.), not from process count — one process can handle 50+ concurrent I/O-bound jobs. Don't conflate "100 workers" with "100 processes."
Each stage has its own retry/backoff settings, its own concurrency limit, and potentially its own quota allocation. Stages must not share worker pools because they have different cost profiles (YouTube quota costs vary 1-100 units per call across endpoints).
Failure handling
On success:
sqlUPDATE <table> SET
  <stage>_status   = 'ready',
  <stage>_next_at  = now() + <refresh_interval>,
  <stage>_error    = NULL,
  <stage>_attempts = 0
WHERE id = $1;
For terminal stages (run once, never refresh), set status to done instead of ready and omit next_at. The partial index automatically excludes them.
On failure with exponential backoff and terminal-after-N:
sqlUPDATE <table> SET
  <stage>_status   = CASE WHEN <stage>_attempts + 1 >= <max>
                          THEN 'failed' ELSE 'ready' END,
  <stage>_next_at  = now() + (interval '1 minute' * power(2, <stage>_attempts)),
  <stage>_error    = $error,
  <stage>_attempts = <stage>_attempts + 1
WHERE id = $1;
failed is terminal until manually inspected/reset. skipped is terminal until manually unskipped. Both are excluded from the partial index automatically.
Crash recovery: sweeper
For every stage, run a periodic sweeper (every minute or so) that resets stuck running rows:
sqlUPDATE <table> SET <stage>_status = 'ready'
WHERE <stage>_status = 'running'
  AND <stage>_started_at < now() - interval '<threshold>';
Threshold should be 2-3× the expected longest job duration for that stage.
Heartbeats for long-running stages
For any stage where jobs can take more than a few minutes (video discovery, captions processing, anything multi-step), implement heartbeats. The worker periodically (every ~60s) does:
sqlUPDATE <table> SET <stage>_started_at = now()
WHERE id = $1 AND <stage>_status = 'running';
This lets the sweeper threshold stay tight (e.g., 5 minutes) regardless of how long jobs actually run. A live worker keeps refreshing started_at; a dead worker stops, and the row is reclaimed within minutes.
Tiered refresh cadence
Refresh intervals must be tiered, not flat. The driver is YouTube API quota, not freshness preferences. Compute next_at based on entity importance:
next_at = now() + f(subs_count, recency_of_activity, manual_priority_flag)
A 50M-sub daily-uploading channel might refresh weekly; a dormant 200-sub channel might refresh quarterly or never. Build this into the success-path UPDATE from day one — it's the actual constraint the system operates under, not something to add later.
Stage-to-stage handoff
Stages communicate by updating the next stage's columns on relevant rows. Examples of patterns:

Direct fan-out: video discovery inserts new video rows with metadata_refresh_status='ready'. The metadata worker's partial index sees them on its next claim.
Conditional activation: metadata worker fetches video; if hasManualCaptions=true, it sets captions_status='ready' in the same UPDATE that records the metadata result. Otherwise leaves captions_status NULL (excluded from index).
Precondition flip: language detection's status starts at pending. When metadata fetch reveals language is unknown, that worker flips lang_detect_status='ready' on the row.

No queue messages, no separate job records, no scheduler. The same UPDATE that records "stage X is done" also records "stage Y is now eligible."
Conditional/sparse stages
When a stage applies to only a subset of entities (e.g., captions processing for ~20% of videos), use a NULLable status column. NULL = stage doesn't apply. The partial index WHERE status='ready' excludes both NULL rows and pending/done/failed rows. This is exactly what partial indexes are for — don't create separate tables for sparse stages.
At 50M+ rows: tuning
Required tuning that becomes necessary (not optional) at this scale:

fillfactor=80 on hot tables — set BEFORE the table grows; can't easily change after
Aggressive autovacuum settings per-table (e.g., autovacuum_vacuum_scale_factor=0.02)
PgBouncer in transaction pooling mode in front of Postgres (worker count × stages > 200 connections will overwhelm Postgres)
Monitor count(*) WHERE status='ready' AND next_at <= now() per stage as the queue depth metric — should stay near zero or only grow briefly

If vacuum becomes a real bottleneck, consider splitting hot status columns into a side table per stage (narrow row, high-churn) leaving the main entity table cold and stable. Try fillfactor + autovacuum tuning first.
Starvation handling for priority queues
Priority queues can starve low-tier work indefinitely. Three options, in order of preference:

Accept it — priority means priority
Reserve N% of workers for FIFO claims that ignore tier
Age low-tier entries upward periodically

Default to option 1. Add option 2 only if starvation is observed.
What NOT to add
The following were considered and rejected for this workload. Do not suggest them unless the user describes a specific problem they would solve:

Separate jobs table per stage: doubles writes, creates table bloat, adds synchronization, and provides nothing the entity-row pattern doesn't. Rejected.
BullMQ / Celery / Sidekiq: the entity-row pattern already provides retries, backoff, scheduling, deduplication, concurrency control. Only the admin UI is missing, and that's a one-day build against the existing schema. Rejected.
Kafka / RabbitMQ / SQS: queues are for transient events without a stable home in a database. This workload is the opposite — entities have permanent homes, get processed multiple times over their lifetime, need to be queryable. A queue would just be a copy of state already in the DB. Rejected.
Lambda / Cloud Functions for the hot loop: workers are long-running, benefit from connection reuse and intra-process concurrency, and are claim-driven not event-driven. Lambdas are wrong-shaped. Rejected.
NoSQL (DynamoDB/etc.): would lose the partial-index claim pattern, joins for analytics, ad-hoc queryability. Postgres handles the scale. Rejected.
Sharding / table partitioning: not needed at 50-100M rows. Reconsider only at 500M+ or when single-index size exceeds RAM.

When the architecture would actually need to change
These are the trigger conditions to watch for. None apply currently:

Sustained claim throughput >5,000/sec across all stages combined (currently ~100-200/sec)
A stage genuinely needs multiple concurrent in-flight jobs per entity (entity-row pattern can't express this; would need a job table for that stage only)
External systems need to consume pipeline events as a stream (would add Kafka for that interface, not replace the pipeline)
Multi-region writes with low latency requirements (would consider CockroachDB/Spanner)
Storage exceeds what a single Postgres instance comfortably handles (would partition before sharding)

Cloud migration (if/when it happens)
Lift-and-shift, not rewrite. Postgres → managed Postgres (RDS/Aurora/Cloud SQL). Workers → containers (ECS Fargate, GKE, Cloud Run jobs). Same code, same architecture. Add managed secrets, object storage for blobs, and CloudWatch/Cloud Monitoring. Do NOT rewrite the pipeline to use Lambda, Step Functions, DynamoDB, or SQS during migration. Those decisions should only follow specific observed problems, never preemptive cloud-native enthusiasm.
Summary of pattern application
For any new stage being added, the checklist is:

Add status column group to the relevant entity table (status, error, attempts, started_at, next_at, optionally skip_reason)
Create partial index on (next_at) WHERE status='ready' for claims
Create partial index on (started_at) WHERE status='running' for the sweeper
Decide batch size based on job duration and downstream API shape (1 for long jobs, 50 for batchable short API calls)
Implement worker with claim CTE + work + success/failure UPDATE
Add heartbeat if jobs can run >2 minutes
Add sweeper with threshold = 2-3× expected longest duration
Determine refresh cadence (or done for terminal stages) and how it tiers by entity importance
Decide what UPDATE on what other rows constitutes the handoff to the next stage
Add queue depth metric for monitoring