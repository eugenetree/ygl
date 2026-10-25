# 01 — Tasks on pg-boss, first task: recalculate priorities

**What to build:** the operator sends `/recalculate_priorities` and the bot
replies within a second with the run's id, or "already running" when a run of
that task is already queued or running. The scraper picks the run up and
recalculates every channel's priority, the same work the bot does inline today.
This is the first path through the tasks mechanism (ADR 0015, spec
`.scratch/007-tasks/spec.md`):

- the migrate step installs and upgrades pg-boss's schema;
- the tasks module provides the wrapper (`start`, `stop`, `request`, `work`) and
  the task constants (name, queue settings, payload type);
- the scraper and the bot each start and stop the wrapper explicitly.

The recalculate-priorities use case stays unaware that it runs as a task.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] The migrate step installs pg-boss's schema in the app database, and a
      second run of it is a no-op.
- [ ] The scraper and the bot start pg-boss with migrations off, and refuse to
      start when its schema doesn't match the installed version.
- [ ] pg-boss is imported only by the wrapper. Feature modules don't import the
      tasks module.
- [ ] `start()` creates every task's queue from the task constants, so the bot
      can request a run before the scraper has ever started.
- [ ] The queue allows one run queued or active at a time, doesn't retry, sends
      heartbeats every 60 seconds, and expires a run after a safety limit of
      minutes.
- [ ] `/recalculate_priorities` replies with the run id, or "already running"
      for a second request while one is queued or running.
- [ ] The scraper works the run whether scraping is started or stopped, and
      `/stop` doesn't cancel it.
- [ ] After a run, every channel's priority score has been recalculated and
      propagated to its pending jobs.
- [ ] `/recalculate_priority` is gone from the bot's handlers and from its
      synced command list.
- [ ] Wrapper tests against the real test database: `request` returns a run
      id, and a second request while one is queued or running comes back as
      already running.
