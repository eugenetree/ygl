# 02 — Messages when a run ends

**What to build:** when any run ends, the operator gets exactly one Telegram
message, even if the bot was down at the time:

- completed, with the task's summary;
- failed, with the error;
- failed because its worker stopped responding.

The wrapper, not each task, publishes a `task-run-ended` event through pg-boss's
publish/subscribe whenever a handler returns or throws. The bot subscribes
through `onRunEnded` and formats a message for each task, so workers never write
Telegram text. Runs whose worker died are failed by heartbeats and reported
through a dead-letter queue the bot works. Recalculate priorities gets the first
summary. See spec `.scratch/007-tasks/spec.md`, "Runs ending".

**Blocked by:** 01 — Tasks on pg-boss, first task: recalculate priorities

**Status:** resolved

- [ ] The event carries the task, the run id, the outcome (`completed` or
      `failed`), the requested, started and ended times, and the output or the
      error.
- [ ] A handler's return value is stored as the run's output.
- [ ] Completing a recalculate-priorities run sends one message with its
      duration and its recalculated and failed channel counts.
- [ ] A run whose handler throws sends one message with the task, run id,
      how long it ran, and the error.
- [ ] A run whose worker dies is marked failed within about two minutes, and
      sends one message saying the worker stopped responding.
- [ ] An event published while the bot is down is delivered when it comes back.
- [ ] Message formatting for each task is a plain function with unit tests.
- [ ] Wrapper tests against the real test database, each checked by subscribing
      through `onRunEnded` and awaiting the event with a timeout: a returning
      handler gives outcome `completed` with its output, a throwing handler
      gives `failed` with the error, and a worker that stops heartbeating is
      reported through the dead-letter queue. Monitoring and heartbeat
      intervals are shortened so the tests finish in seconds.
- [ ] Confirmed against pg-boss: a run failed by a lost heartbeat reaches the
      dead-letter queue, not only one whose handler threw.
