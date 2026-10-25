# 03 — `/tasks`

**What to build:** `/tasks` lists every task with its latest run: its state
(queued, running, completed, failed), when it was requested, and how long it has
been running or how long it took. A task with no recent run shows "no runs in
the last 7 days". Each task can have a progress line, read by a query in the
feature module that owns the data; recalculate priorities has none, so this
ticket provides the slot that reprocessing and the rebuild fill. `/tasks` keeps
working while a task's worker is down. See spec `.scratch/007-tasks/spec.md`,
"Telegram" and "Progress".

**Blocked by:** 01 — Tasks on pg-boss, first task: recalculate priorities

**Status:** ready-for-agent

- [ ] `/tasks` lists every task in the task constants, each with its latest
      run's state and times, or "no runs in the last 7 days".
- [ ] A running task shows how long it has been running.
- [ ] A task can supply a progress line, shown only while its run is active.
- [ ] `/tasks` answers while the scraper is down, showing the run as it was
      last recorded.
- [ ] Wrapper tests against the real test database: `latestRuns` returns the
      latest run of each task, and nothing for a task without one.
