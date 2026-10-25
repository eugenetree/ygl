# Spec: Run tasks in the processes that own their data, requested from Telegram

Status: ready-for-agent

## Problem Statement

After the auto caption end-time fix, the operator has to run three commands
from Telegram, in order: `/reprocess_captions`, `/recalculate_priority`,
`/resync_captions`. Each one runs inside the bot process, awaited by the
Telegram handler.

- **The bot is also the alerting channel.** It sends scraper failure alerts and
  answers `/start`, `/stop` and `/stats`. Work that crashes the bot takes the
  alerts down with it, and on prod the bot's container doesn't restart.
- **The bot ignores everything else for 90 seconds** at the start of each
  command, until Telegraf's handler timeout lets polling continue.
- **There's no way to see a run in progress.** The operator gets "started", then
  nothing until one reply at the end, or no reply at all if the process died.
  Reprocessing about 58k videos takes about 1.5 hours.
- **`/resync_captions` would crash the bot on prod.** It deletes the search index
  first, then loads every searchable caption into memory in one query: about
  8.2M rows against a 2.2 GB heap, on a host with 3.4 GB free and no swap.
  Search would be empty from the first second and would stay partial after the
  crash. The incremental sync only adds newly created captions, so it would
  never refill the index.
- **Nothing stops a command running twice.** A second `/reprocess_captions`
  while one is running reprocesses the same videos in parallel.

## Solution

Reprocessing captions, recalculating priorities and rebuilding the search index
become **tasks**. The bot only requests a run and reports on it. The work runs
in the process that owns the data the task changes: the scraper reprocesses
captions and recalculates priorities, and the search sync rebuilds the search
index. Requests, runs and "a run ended" events travel through pg-boss in our
Postgres (ADR 0015).

- **The operator requests a run** with one command per task:
  `/reprocess_captions`, `/recalculate_priorities`, `/rebuild_search_index`.
  The bot replies straight away with the run's id, or "already running".
- **`/tasks` shows every task's latest run:** its state, how long it has run,
  and, while running, how much is left, read from the data the task changes.
- **When a run ends, the operator gets one message:** completed with a summary,
  failed with the error, or failed because its worker stopped responding.
- **The rebuild builds a new index next to the live one** and swaps the search
  alias at the end. Search stays fully available throughout, memory stays flat,
  and a failed rebuild leaves the live index untouched.

## User Stories

1. As the operator, I want to request reprocessing from Telegram and get a reply
   within a second, so that the bot never ignores my other commands.
2. As the operator, I want the reply to a request to include the run's id, so
   that I can match later messages to my request.
3. As the operator, I want a second request for a task that is already queued
   or running to be refused with "already running", so that the same work
   never runs twice at once.
4. As the operator, I want to be able to request one task while another task is
   running, so that I decide the order myself.
5. As the operator, I want reprocessing to run in the scraper, so that a crash
   during reprocessing can't take down the bot or its alerts.
6. As the operator, I want recalculating priorities to run in the scraper, so
   that it sits with the priority scheduler that owns priorities.
7. As the operator, I want rebuilding the search index to run in the search
   sync, so that only one process ever writes the search index.
8. As the operator, I want the search sync to never run an incremental pass
   during a rebuild, so that the two can't write the index at the same time.
9. As the operator, I want tasks to run whether scraping is started or stopped,
   so that I can stop scraping to give reprocessing the CPU.
10. As the operator, I want `/stop` to leave a running task alone, so that
    stopping scraping never cancels reprocessing by accident.
11. As the operator, I want `/tasks` to list every task with its latest run, so
    that I can see at a glance what is running and what ran recently.
12. As the operator, I want `/tasks` to show how long a running task has been
    running, so that I know whether it is on track.
13. As the operator, I want `/tasks` to show how many videos reprocessing still
    has left, so that I can tell how far it has got.
14. As the operator, I want `/tasks` to show how many captions the new index
    holds compared with the live one during a rebuild, so that I can tell how
    far the rebuild has got.
15. As the operator, I want progress read from the data the task changes, not
    reported by the worker, so that it is accurate even when the worker is
    stuck.
16. As the operator, I want `/tasks` to work while a task's worker is down, so
    that I can see what happened exactly when something is broken.
17. As the operator, I want `/tasks` to say "no runs in the last 7 days" for a
    task with no recent run, so that it never claims a task has never run.
18. As the operator, I want one message when reprocessing completes, with its
    duration, processed and failed counts, both-valid counts before and after,
    and became-valid and became-invalid counts, so that I can judge the result
    without a flood of messages.
19. As the operator, I want the full lists of videos that became valid or
    invalid kept in the worker's log and the run's stored output, so that I can
    look them up without them filling the chat.
20. As the operator, I want one message when a rebuild completes, with its
    duration, captions indexed, and the old and new index sizes, so that I can
    check nothing went missing.
21. As the operator, I want one message when recalculating priorities completes,
    with its duration and the recalculated and failed channel counts.
22. As the operator, I want a message with the error when a run fails, so that
    I know a task needs attention.
23. As the operator, I want a message saying the worker stopped responding when
    a worker dies mid-run, so that a crash never goes unnoticed.
24. As the operator, I want a run whose worker died to be marked failed within
    about two minutes, so that it doesn't block new requests for that task.
25. As the operator, I want the messages about ended runs to be delivered once
    the bot is back if it was down when the run ended, so that none are lost.
26. As the operator, I want every stop of a run, including a deploy, to end the
    run as failed with no automatic retry, so that an error never loops in the
    background.
27. As the operator, I want a reprocessing run I request again after a failure
    to continue where the failed one stopped, so that a deploy mid-run costs me
    one command, not 1.5 hours.
28. As the operator, I want a rebuild that fails halfway to leave the live index
    as it was, so that search never suffers from a failed rebuild.
29. As the operator, I want the next rebuild to delete any half-built index left
    by a failed one, so that leftovers don't pile up on the disk.
30. As a site user, I want search to keep answering while the index is being
    rebuilt, so that I never see empty or partial results.
31. As a site user, I want search to keep answering at the moment the rebuilt
    index takes over, including the first time, so that there is no gap.
32. As the operator, I want the rebuild to index only the manual captions of
    searchable videos, so that it matches what the incremental sync indexes.
33. As the operator, I want the rebuild to remove the captions of videos that
    are no longer searchable, so that search reflects reprocessing.
34. As the operator, I want the rebuild's memory use to stay flat however many
    captions there are, so that it can't run the search sync out of memory.
35. As the operator, I want the rebuild to read captions video by video using
    the captions' video id index, so that it needs no new index on the captions
    table.
36. As the operator, I want the incremental sync to pick up captions created
    during a rebuild, so that none are missing once the rebuild ends.
37. As the operator, I want the rebuild to write to the search index in
    batches small enough for its 512 MB heap, so that indexing doesn't starve
    searches.
38. As the operator, I want the commands named after their tasks, with
    `/resync_captions` replaced by `/rebuild_search_index` and
    `/recalculate_priority` by `/recalculate_priorities`, so that each name says
    what the task does.
39. As the operator, I want the deploy's migrate step to install and upgrade
    pg-boss's schema, so that it only changes the database during a deploy.
40. As the operator, I want a process to refuse to start if pg-boss's schema
    doesn't match its version, so that a mismatch shows up at boot, not at my
    first command.
41. As a developer, I want feature use cases to know nothing about tasks, so
    that I can still run them from a script or a test.
42. As a developer, I want pg-boss imported in exactly one place, so that its
    API and quirks stay out of the rest of the code.
43. As a developer, I want each task's name, queue settings and payload type
    declared once and shared by every process, so that the bot and the workers
    can't disagree about a queue.
44. As a developer, I want workers and the bot to share nothing but those
    declarations, so that the bot never imports a worker's use cases.
45. As a developer, I want the wrapper, not each task, to publish "a run ended",
    so that no task can forget to.
46. As a developer, I want the bot to format each task's messages, so that
    workers never write Telegram text.

## Implementation Decisions

### Vocabulary

- **Job** is a scraping queue item, **Task** a kind of work requested on demand
  that runs once to completion, **Run** one occurrence of a task, and **Search
  index** the copy of searchable videos' manual captions that searches run
  against (all in `CONTEXT.md`). Code and messages use these words. In pg-boss,
  a task is a queue and a run is a job in that queue; pg-boss's words stay
  inside the wrapper.

### The tasks module

- A new module in the shared common area holds two things:
  - **The wrapper**, the only importer of pg-boss. Its surface, roughly:

    ```ts
    start(): Promise<void>            // connect, check the schema, create every task's queue
    stop(): Promise<void>
    request(task, data): Promise<Result<RunId, AlreadyRunning | DatabaseError>>
    work(task, handler: (data, signal: AbortSignal) => Promise<output>): Promise<void>
    onRunEnded(handler: (event: RunEnded) => Promise<void>): Promise<void>
    latestRuns(): Promise<LatestRun[]>  // one entry per task: state, requested, started, ended
    ```

  - **The task constants**: each task's name, queue settings and payload type,
    as plain data with no imports from feature modules.
- `start()` creates every task's queue from the constants, so whichever process
  starts first creates them, with the same settings everywhere.
- Every process that uses tasks (scraper, search sync, bot) calls `start()` once
  at boot and `stop()` on shutdown, explicitly, beside its heartbeat, scheduler
  and listeners. `request` and `work` never start pg-boss themselves.
- Each process's entry point connects `work(task, …)` to the feature use case.
  Feature modules never import the tasks module.

### Queue settings

- **One run per task at a time:** a policy that allows only one job queued or
  active. A request refused by the policy becomes `AlreadyRunning`.
- **No retries:** every stop is a failure.
- **Heartbeats on, every 60 seconds:** a dead worker's run is failed within
  about two minutes.
- **Expiry** is set per task, well above its longest expected run, as a safety
  net (hours for reprocessing and the rebuild, minutes for priorities).
- **Failed runs go to a dead-letter queue** that the bot works. This is how a
  run whose worker died is reported.
- Finished runs are kept for pg-boss's default 7 days.

### Runs ending

- When a handler returns or throws, the wrapper publishes a `task-run-ended`
  event through pg-boss's publish/subscribe: task, run id, outcome
  (`completed` or `failed`), requested, started and ended times, and the output
  or the error.
- The handler's return value is the run's stored output.
- The bot subscribes through `onRunEnded`, formats a message per task, and sends
  it to the operator's chat. Runs from the dead-letter queue are reported the
  same way, as "worker stopped responding".
- Subscriptions are durable queues, so an event published while the bot is down
  is delivered when it comes back.

### Telegram

- One controller replaces the three task controllers, with
  `/reprocess_captions`, `/recalculate_priorities`, `/rebuild_search_index` and
  `/tasks`. The old `/resync_captions` and `/recalculate_priority` are removed
  from the handlers and from the synced command list, with no aliases.
- A request command makes one `request` call and replies with the run id, or
  "already running".
- `/tasks` combines `latestRuns()` with each task's progress query.
- Reading stays inline in the bot: `/stats`, `/find` and `/last` are unchanged.

### Progress

- Progress queries live in the feature module whose data they read, and the
  telegram controller calls them.
  - **Reprocess captions:** videos still waiting for the current captions
    processing algorithm version, using the same filter as the reprocessing
    loop.
  - **Rebuild search index:** documents in the index being built against the
    live index's count. The total is approximate.
  - **Recalculate priorities:** none, only the elapsed time.
- No progress table, and no starting total in the request: a request's payload
  is empty.

### Reprocess captions

- The existing use case accepts an abort signal and stops at the next video
  once it fires.
- It returns the counts and the full became-valid and became-invalid lists as
  its output, and logs the lists. The notification shows counts only.

### Recalculate priorities

- The existing use case runs unchanged as a task.

### Rebuild search index

- It replaces the current resync use case, and runs in the search sync's loop
  between incremental passes when a run is waiting. The search sync is the
  only process that writes the index.
- At start, it deletes any half-built index left by an earlier failed rebuild,
  and records the newest caption at that moment.
- It builds a new index with a dated name and the existing settings and
  mappings. It goes through searchable videos in id order and loads each
  video's manual captions with the captions' video id index, so memory stays
  flat. It bulk-writes in batches sized for a 512 MB heap.
- At the end, it records a successful sync whose watermark is the caption
  recorded at start. The next incremental pass picks up captions created during
  the rebuild; indexing a caption twice is harmless because documents are keyed
  by caption id.
- Then one atomic alias request points the `captions` alias at the new index,
  the last step that can fail the run. If it fails, the sync is marked failed
  again, so the incremental sync goes on from the sync before.
- After a 5-second grace period for searches still running on it, it deletes
  the old index. Deleting it in the alias request would fail those searches.
  A failed delete is logged, not a failed run: the next rebuild removes it with
  the other leftovers.
- The first time, the old index is the one literally named `captions`, which
  has to go in the alias request, by a `remove_index` action. Searches in flight
  then fail with index-not-found or `no_shard_available_action_exception`, so
  searches retry once on those: the retry resolves `captions` to the new index.
- Searches and the incremental sync address the index by the `captions` alias,
  so neither changes.

### Schema and deploy

- The migrate step installs and upgrades the `pgboss` schema, in the same
  database, before the other containers start. App processes start pg-boss
  with migrations off, so a version mismatch fails at boot.
- No changes to our own tables.

## Testing Decisions

- A good test drives a module through its public calls and checks what a
  consumer would see: what a request returns, what a subscriber receives, what
  the search index ends up holding. It never spies on internals or reads
  pg-boss's tables.
- **The tasks wrapper**, against real Postgres through the existing
  per-suite test database. The pg-boss schema arrives through the migrations,
  like the rest of the schema. Monitoring and heartbeat intervals are
  shortened so tests finish in seconds. It covers:
  - `request` returning a run id, and a second request while one is queued or
    running coming back `AlreadyRunning`;
  - a handler's return producing a `task-run-ended` event with outcome
    `completed` and the output, checked by subscribing through `onRunEnded`
    exactly as the bot does and awaiting the event, with a timeout;
  - a handler's throw producing outcome `failed` with the error;
  - a worker that stops heartbeating leaving its run failed and reported
    through the dead-letter queue;
  - `latestRuns` returning the latest run of each task.
  - Prior art: the queue database tests (video entries, channels) and the push
    channel use case database test.
- **The rebuild search index use case**, against real Postgres and a fake
  Elasticsearch client. It covers:
  - only searchable videos' manual captions being indexed into a new dated
    index;
  - the alias moving to it and the old index being deleted;
  - a leftover half-built index being removed at start;
  - the recorded watermark being the newest caption at start.
  - Prior art: the captions service test's fake client.
  - The atomic first switch-over is checked once by hand against a local
    Elasticsearch, since a fake can't show that ES accepts it.
- **Reprocess captions:** the use case stopping once its abort signal fires,
  and its progress query, against real Postgres.
- **Message formatting** for each task: plain functions with unit tests.
- The telegram controller isn't tested, like the other controllers.

## Out of Scope

- **Owners noticing updated videos** (an `updated_at` watermark for the priority
  scheduler and the incremental sync). Parked in the auto caption end-times
  spec. When it lands, the recalculate-priorities task is deleted and the
  rebuild is no longer needed after reprocessing.
- **Moving scraping jobs onto pg-boss** (ADR 0015).
- **A run history beyond 7 days.** It would be a `task_runs` table subscribed to
  `task-run-ended`.
- **Requesting reprocessing automatically** when the captions processing
  algorithm version changes.
- **Rules between tasks**, such as chaining or blocking. The operator keeps the
  order.
- **The slow incremental pass** (about 14 seconds even with nothing new, because
  captions have no index on creation time).
- **Restart policies** for the app containers.
- **Metrics and dashboards** for runs.

## Further Notes

- **Nothing runs on prod until this ships.** Prod's scores and search stay as
  they are until then. After the deploy, the operator requests reprocessing
  (about 58k videos, about 1.5 hours at the last measured 95 ms per video), then
  priorities (440 channels, 1–2 minutes), then the rebuild (about 8.2M
  captions).
- **pg-boss needs Node 22.12+ and Postgres 13+.** Prod runs Node 24 and
  Postgres 18.
- **Check against pg-boss before relying on these:**
  - that a request refused by the one-at-a-time policy returns no id;
  - that a run failed by a lost heartbeat reaches the dead-letter queue, not
    only one whose handler threw.
- **Disk for the rebuild:** the host has 35 GB free and the live index is about
  3 GB, so holding both during a rebuild brings the disk from about 52% to about
  56%, below Elasticsearch's 85% low watermark.
- **Six stale `IN_PROGRESS` sync records** from June and October are on prod,
  left by earlier processes that died mid-sync. They're harmless: the
  incremental sync only reads successful records.
