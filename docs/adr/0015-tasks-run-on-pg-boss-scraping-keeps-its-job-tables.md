# Tasks run on pg-boss; scraping keeps its own job tables

Tasks (reprocessing captions, recalculating priorities, rebuilding the search
index) are requested from the Telegram bot and worked by the process that owns
the data they change: reprocessing and priorities by the scraper, the rebuild by
the search sync. They go through pg-boss, wrapped by `_common/tasks/tasks.ts`,
the only file that imports it. Scraping jobs stay in our own tables. Two queue
mechanisms side by side is deliberate.

## Why

- **Tasks used to run inside the bot.** The bot also sends scraper alerts, so a
  task that ran out of memory took the alerts down with it, and the bot ignored
  other commands for the first 90 seconds of every task.
- **pg-boss needs nothing new to run.** It keeps its jobs in our Postgres, in a
  `pgboss` schema. It already has what a hand-rolled table would need building:
  one run per task at a time, heartbeats that fail a dead run, a dead-letter
  queue for runs whose worker died, and publish/subscribe for "a run ended".
- **Scraping jobs are data about the domain, not throwaway work.** Priority
  scoring joins `video_jobs` with `videos`, pending jobs have their priority
  rewritten, and `/stats` counts jobs by status. pg-boss deletes completed jobs
  and stores their data as JSON in its own schema, so none of that fits it.

## Considered options

- **Our own task table**, like `scraping_process.requestedStatus`. Every piece
  pg-boss provides would be ours to write and get right: locking, stale-run
  detection, and delivering a notification when nobody is listening.
- **BullMQ.** Progress is built in, but it needs a Redis we'd have to run and
  back up, just for a few runs a month.
- **DBOS Transact.** Durable workflows on Postgres, with live state a running
  workflow can publish. The closest second; rejected as newer, and asking more
  of the task code than a queue does.
- **HTTP between the bot and the workers.** The bot would hold run ids and
  poll, and a run's status would be unreadable exactly when its worker is down.
- **Moving scraping onto pg-boss too.** One mechanism, but the reasons above
  still apply to scraping jobs.

## Consequences

- `migrate` installs and upgrades the `pgboss` schema. The app processes start
  pg-boss with `migrate: false`, so a version mismatch stops a process at boot.
- Every stop of a run, including a deploy, fails it: no automatic retries. A
  failed reprocessing run, requested again, continues where it stopped.
- pg-boss keeps finished runs for 7 days. A longer history would be a
  `task_runs` table subscribed to the "run ended" event.
- Progress is read from the data each task changes, never reported by the
  worker, so `/tasks` stays accurate when a worker is stuck.
