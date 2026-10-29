# Should the line between `Messaging`, `TaskQueue` and `EventBus` move, so `Messaging` only starts and stops pg-boss and offers a generic `createQueue(name, settings, policy?)`, while `TaskQueue` and `EventBus` each own their queue settings? And if so: where does `relayFailedRuns` get started, and where does the `eventRetries` test setting go?

**Parked:** 2026-10-29 · `bugfix/auto-captions` @ `325efb1` (messaging work uncommitted)
**Where:** `src/modules/_common/messaging/messaging.ts`, `task-queue.ts`, `event-bus.ts`, `failed-runs.ts`, `.scratch/007-tasks/spec.md`, `.scratch/007-tasks/issues/02-messages-when-a-run-ends.md`, `docs/adr/0015-tasks-run-on-pg-boss-scraping-keeps-its-job-tables.md`

Two smaller items from the same review, filed with it:

1. Docs cleanup: the ticket in `.scratch/007-tasks/` numbered 02 still describes the removed `task-run-ended` event and `onRunEnded`; `.scratch/007-tasks/spec.md` contradicts itself on who works the dead-letter queue ("Failed runs go to a dead-letter queue that the bot works" under "Queue settings" vs "A relay in every process that starts messaging publishes each one" under "Runs ending").
2. `relayFailedRuns` calls `boss.work` and `boss.publish` directly, while `docs/adr/0015-tasks-run-on-pg-boss-scraping-keeps-its-job-tables.md` says everything subscribes through `EventBus`. It has to read pg-boss's dead-letter job data, so it sits below the bus, but it could publish through `eventBus.publish(TASK_RUN_FAILED, …)` so the payload is type-checked like every other event.

## Doubt

An outside review said the dividing line is slightly off:
- `Messaging` exposes `boss` as a public field for the other two to use.
- `Messaging.createTaskQueue(task)` holds task-specific settings (`retryLimit: 0`, heartbeat default `DEFAULT_HEARTBEAT_SECONDS`, `expireInSeconds`, `deadLetter: FAILED_RUNS_QUEUE`, `"exclusive"` policy) that belong to `TaskQueue`, whose doc comment states those guarantees ("one run at a time", "never retries"). Likewise `createEventQueue` and `EVENT_RETRIES` live in `messaging.ts` though `EventBus` documents the ~2h retry guarantee.
- `messaging.ts` imports `type AnyTask` from `task-queue.ts`, which imports `Messaging` from `messaging.ts`: a type-only cycle (erased at runtime, but the dependency points both ways).

## Sanity check

**holds**: `messaging.ts:104` `createTaskQueue(task: AnyTask)` and `messaging.ts:98-100` `createEventQueue` hold the task and event settings, `messaging.ts:11` is the type-only import of `AnyTask`, and they are called from `task-queue.ts:139` and `event-bus.ts:65`. `messaging.ts:90-91` starts the relay. Items 1 and 2 are also true: `spec.md:227` vs `spec.md:239-240`, `issues/02-messages-when-a-run-ends.md:10,12,34`, and `failed-runs.ts:20,26` use `boss.work`/`boss.publish` directly. Nothing found settles it either way.

## Context

Wrinkles already found in the conversation, not yet decided with the user:
- `boss` stays exposed either way: `TaskQueue` needs `send`/`work`/`findJobs`, `EventBus` needs `publish`/`subscribe`/`work`; hiding it means `Messaging` proxying each, i.e. becoming a pg-boss wrapper. So the move fixes two of the three complaints.
- `relayFailedRuns` is started today by `Messaging.start()` in every process (bot included), so a run whose worker died is relayed by whichever process is still up. If it publishes through `EventBus` (item 2), `Messaging` can't start it (`EventBus` depends on `Messaging`). Options: an explicit `taskQueue.start()` in every `src/main-*.ts` (one more line to forget), or start it on the first `work` (only scraper and elastic relay; if both are down, the failure is reported when one comes back: later, not lost). The assistant leaned to first `work`.
- `eventRetries` (and `monitorIntervalSeconds`) are test-only options passed to `Messaging` through an `@unmanaged()` constructor parameter; if event queue settings move to `EventBus`, the test setting needs a route there (its own `@unmanaged()` parameter, or passed through `Messaging`).
- Recent decisions on this branch (keep them): queues are created by whoever reads them on first use (`work` creates a task's queue, `subscribe` creates `<event>.<consumer>`); `Messaging` is `@injectable()` and each `main-*.ts` binds it `inSingletonScope()`; no `bindMessaging`; `TASKS` and `EVENTS` are keyed objects in `definitions.ts`; tests build `Messaging`/`EventBus`/`TaskQueue` by hand because tsx emits no decorator metadata.
- The user postponed this deliberately; it's not rejected.
