## Problem Statement

All four scraper modules (channel-discovery, channel, video-discovery, video) have use cases that own queue orchestration — they call `getNextEntry()`, do work, then call `markAsSuccess/markAsFailed`. This couples use cases to the queue infrastructure, making them uncallable from any other context (API controller, CLI, another use case). The architecture conflates "application workflow" with "business logic," making it harder to reuse core domain operations and reason about layer responsibilities.

## Solution

Refactor all scraper modules to follow a consistent layered architecture:
- **Workers** own queue orchestration (getNext → call use case → markStatus)
- **Use cases** are pure: `execute(input) → Result`. No queue awareness. Callable from anywhere.
- **Services** hold reusable domain logic, extracted only when shared by 2+ use cases.
- Delete dead code: batch use case, `_proposed/` folder, `channels.worker_old.ts`, `QueueUseCaseResult` type.

## User Stories

1. As a developer, I want use cases to take explicit inputs and return results, so that I can call them from workers, controllers, CLI tools, or tests without queue dependencies.
2. As a developer, I want workers to own queue orchestration, so that the queue lifecycle (getNext, markStatus) is centralized in one place per module.
3. As a developer, I want a consistent architecture across all 4 scraper modules, so that I can reason about any module using the same mental model.
4. As a developer, I want to be able to add a new entry point (e.g., webhook controller) that reuses existing use cases without duplicating business logic.
5. As a developer, I want to be able to test use cases by passing inputs directly, without needing to set up queue state.
6. As a developer, I want dead code removed (batch use case, proposed folder, old worker file, queue use case types), so the codebase stays clean.
7. As a developer, I want forward-enqueue calls (enqueuing to the next module's queue) to remain inside the use case or service, because scheduling downstream work is domain logic.
8. As a developer, I want the video module's internal service structure (caption analysis, validators, mapper) to remain co-located with its use case, since they are only used by that one use case.

## Implementation Decisions

### Architecture rules

- **Use case** = entry point for a business operation. Signature: `execute(input) → Result`. No queue calls (getNext/markStatus). Callable from worker, controller, CLI.
- **Service** = reusable domain logic. Only extracted when 2+ use cases share the same core logic. Otherwise the use case IS the logic.
- **Worker** = queue loop. Owns: `getNext → use case → markStatus`. Handles empty queue (wait/retry), errors (mark failed, continue to next item).
- **Controller** = HTTP/webhook entry point. Can do unconditional side effects. Extracts a use case when conditional business logic appears.
- **Use cases do not nest.** Two use cases needing the same core logic both call a shared service.

### Per-module changes

**channel-discovery**
- Worker (`SearchChannelQueriesWorker`): takes over `getNextQuery()`, `markAsSuccess()`, `markAsFailed()` from use case.
- Use case (`FindChannelsUseCase`): signature changes to `execute(queryId: string) → Result`. Keeps forward-enqueue to `channelEntriesQueue.enqueue()`. No service extraction needed (only one use case).

**channel**
- Worker (`ChannelEntriesWorker`): takes over `getNextEntry()`, `markAsSuccess()`, `markAsFailed()` from use case.
- Use case (`ProcessChannelEntryUseCase`): signature changes to `execute(channelEntryId: string) → Result`. Keeps forward-enqueue to `channelsQueue.enqueue()`. No service extraction needed (only one use case).

**video-discovery**
- Worker (`ChannelsWorker`): takes over `getNextChannel()`, `markAsSuccess()`, `markAsFailed()` from use case. Should continue on failure instead of stopping.
- Use case (`FindChannelVideosUseCase`): signature changes to `execute(channelId: string) → Result`. Delegates to `ChannelVideoDiscoveryService` (already exists).
- Delete: `FindChannelVideosBatchUseCase` (batch is a worker concern).
- Delete: `_proposed/` folder (obsolete after refactor).
- Delete: `channels.worker_old.ts` (leftover from experimentation).

**video**
- Worker (`VideoEntriesWorker`): takes over `getNextEntry()`, `markAsSuccess()`, `markAsFailed()` from use case.
- Use case (`ProcessVideoEntryUseCase`): signature changes to `execute(videoEntry) → Result`. Internal service structure (caption-analysis, validators, mapper) stays co-located and unchanged. Keeps forward-enqueue to `transcriptionJobsQueue.enqueue()`.

### Shared types cleanup
- Delete `QueueUseCaseResult` and `QueueProcessingOutcome` from `_common/queue-use-case.types.ts` (dead code after refactor).

### No changes needed
- `main.ts` and `bootstrap.ts` files: no structural changes beyond updating imports if names change.
- Queue classes: no changes to their interfaces.
- Repository classes: no changes.
- Forward-enqueue calls: stay in use cases/services (domain logic).

## Testing Decisions

A good test for these modules should:
- Test external behavior (input → output), not implementation details
- Pass explicit inputs to the use case, assert on the result and side effects (DB writes, enqueue calls)
- Mock external dependencies (YouTube API, DB, queues) at the boundary
- NOT require queue state setup to test business logic

Tests to write or update:

- **channel-discovery** (`FindChannelsUseCase`): test that given a query ID, it discovers channels via YouTube API, creates entries, and forward-enqueues. New test file.
- **channel** (`ProcessChannelEntryUseCase`): test that given an entry ID, it fetches channel details, saves to DB, and forward-enqueues. New test file.
- **video-discovery** (`FindChannelVideosUseCase`): test that given a channel ID, it delegates to the service correctly. New test file.
- **video-discovery** (`ChannelVideoDiscoveryService`): test core discovery logic — iterating video entries, deduplication, creation, forward-enqueue. New test file.
- **video** (`ProcessVideoEntryUseCase`): update existing test file to match new signature (takes video entry as input instead of pulling from queue).
- **Workers**: test queue orchestration — getNext called, use case called with correct input, markStatus called based on result. New test files per worker.

## Out of Scope

- Adding new entry points (controllers, CLI commands, webhooks) — this refactor prepares the architecture for them but does not implement any.
- Changing queue class internals or selection logic (e.g., country code filtering stays in `ChannelsQueue`).
- Refactoring the video module's internal caption services — they stay co-located as-is.
- Changes to `main.ts` orchestration or bootstrap patterns.
- Notification flows (Telegram, etc.) — hypothetical, to be added when needed.

## Further Notes

- The `_proposed/` folder in video-discovery contains reference implementations showing the target pattern. Use as a guide during implementation, then delete.
- Workers should continue processing on individual item failure (mark failed, move to next) rather than stopping entirely. This is a behavior change from the current implementation.
- The refactor is mechanical: move queue calls from use case to worker, change use case signature to accept input, delete dead code. No business logic changes.
