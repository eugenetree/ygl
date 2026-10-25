# 04 — Reprocess captions as a task

**What to build:** `/reprocess_captions` queues a run of the reprocess task, and
the scraper does the work, so reprocessing about 58k videos (about 1.5 hours)
never runs in the bot. While it runs, `/tasks` shows how many videos are left.
When it ends, the operator gets one message:

- the duration;
- processed and failed counts;
- both-valid counts before and after;
- became-valid and became-invalid counts.

The full became-valid and became-invalid lists go to the worker's log and the
run's stored output, not the chat. A failed run, requested again, continues
where the failed one stopped. See spec `.scratch/007-tasks/spec.md`, "Reprocess
captions".

**Blocked by:** 02 — Messages when a run ends; 03 — `/tasks`

**Status:** resolved

- [ ] `/reprocess_captions` replies with the run id, or "already running".
- [ ] The scraper works the run whether scraping is started or stopped.
- [ ] The reprocess use case accepts an abort signal and stops at the next
      video once it fires, without knowing it runs as a task.
- [ ] The run's output holds the counts and the full became-valid and
      became-invalid lists, and the worker logs the lists.
- [ ] The completion message shows counts only, never video ids.
- [ ] `/tasks` shows the videos still waiting for the current captions
      processing algorithm version while the run is active, counted with the
      same filter as the reprocessing loop.
- [ ] Requesting reprocessing again after a failed run skips the videos that
      run already reprocessed.
- [ ] The old reprocess controller is removed.
- [ ] Tests against the real test database: the use case stops once its
      signal fires, and the progress query counts only the videos the loop
      would still process.
- [ ] The completion message's formatting has unit tests.
