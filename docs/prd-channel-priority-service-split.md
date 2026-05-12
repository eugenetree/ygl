# PRD: Split `ChannelPriorityService` into recalculate + propagate

## Problem Statement

As the developer maintaining the scraping pipeline, when I read code that calls `channelPriorityService.refreshPriority(channelId)` I cannot tell from the call site what it actually does. The method name suggests a single concern ("refresh the priority") but the implementation conflates three: it recomputes the score from raw inputs, persists it to `channelPriorityScores`, *and* cascades the new value into the `priority` column of every PENDING row across `channelJobs`, `videoDiscoveryJobs`, and `videoJobs`.

The companion method `getScrapingScore` looks like a plain cache read but silently returns `0` when no row exists yet — which is exactly the situation in `PushChannelUseCase`'s new-channel branch, where the call returns `0`, the channel is enqueued with priority `0`, and a follow-up `refreshPriority` immediately overwrites it via the cascade. The "0 then overwrite" dance is invisible from the call site.

In two of the four call sites (`ProcessChannelEntryUseCase` and the new-channel branch of `PushChannelUseCase`), the cascade portion of `refreshPriority` is a no-op because no PENDING jobs exist yet for the freshly-created channel. We are paying for and obscuring work that does nothing.

## Solution

Replace the conflated `refreshPriority` with two single-purpose methods on `ChannelPriorityService`, and rename the cache-read method to make its semantics honest:

- `recalculateScore(channelId)` — recomputes from raw inputs and upserts the cache row. Returns the computed scores.
- `propagatePriorityToPendingJobs(channelId, scrapingScore)` — syncs the denormalized `priority` columns on PENDING job rows. Returns the per-queue update counts.
- `getStoredScrapingScore(channelId)` — reads the cached `scrapingScore`. Returns `number | null` (was `getScrapingScore` returning `0` for missing rows). Callers that need a numeric default apply `?? 0` explicitly at the call site.

Every caller becomes an explicit sequence of one or two primitives, and the new-channel paths skip propagation entirely. Public behavior is unchanged: `/push_channel` still reports the same Telegram response, the scheduler still keeps job priorities in sync, `RecalculateAllPrioritiesUseCase` still recomputes everything, and the discovery use cases still enqueue with the same effective priority as today.

## User Stories

1. As a developer reading `PushChannelUseCase`, I want each call into the priority service to make its intent obvious, so that I do not have to open the service implementation to understand what side-effects occur.
2. As a developer reading `ProcessChannelEntryUseCase`, I want the channel-creation path to invoke only the work that is actually needed, so that I am not misled into thinking there are PENDING jobs being updated.
3. As a developer extending the priority service, I want recalculation and propagation to be independently callable, so that I can compose them differently in future use cases without touching the service.
4. As a developer writing tests, I want to mock recalculation independently from propagation, so that test setups reflect only the behavior under test.
5. As a Telegram admin running `/push_channel` against a brand-new channel, I want the channel enqueued with its real (boost-inclusive) priority on the first try, so that the bot's response and the queue state are consistent without an intermediate "priority 0" window.
6. As a Telegram admin running `/push_channel` against an existing channel, I want the reply to report the same per-queue update counts as today, so that my workflow is unaffected by the refactor.
7. As an operator of the scraping pipeline, I want `ChannelPriorityScheduler` to continue refreshing stale channels and propagating to PENDING jobs every five minutes, so that scraping order keeps tracking the latest stats.
8. As an operator running `RecalculateAllPrioritiesUseCase` manually, I want it to recompute and propagate for every channel exactly as it does today, so that I can rely on it to fully re-baseline the queues.
9. As a developer searching the codebase, I want zero remaining references to `refreshPriority` and `getScrapingScore` after the refactor, so that no dead naming lingers.
10. As a developer reading the channel-priority README, I want the "When scores are recalculated" section to describe the new two-method flow, so that the docs match the code.

## Implementation Decisions

**Mental model adopted.** `channelPriorityScores` is treated as a *cache* of a pure function over raw inputs (boost flag, `channels.subscriberCount`, aggregates over `videoJobs` joined with `videos`). Job-row `priority` columns are *denormalized copies* of that cached score. Method naming and responsibilities follow from this distinction.

**`ChannelPriorityService` new surface:**

- `recalculateScore(channelId): Result<{ scrapingScore, searchScore }, DatabaseError>` — fetches stats, runs `ChannelPriorityCalculator.calculate`, upserts `channelPriorityScores`. No job-row updates.
- `propagatePriorityToPendingJobs(channelId, scrapingScore): Result<{ updatedChannelJobs, updatedVideoDiscoveryJobs, updatedVideoJobs }, DatabaseError>` — runs the three `UPDATE … WHERE channelId=? AND status='PENDING'` statements in parallel and returns the counts. Takes the score as a parameter rather than re-reading the cache, so callers can chain it directly off `recalculateScore`'s return value without an extra round-trip and without a "what if the cache row was just changed by someone else" race window.
- `getStoredScrapingScore(channelId): Result<number | null, DatabaseError>` — reads the cached `scrapingScore`, returns `null` when no cache row exists. Replaces `getScrapingScore`. The previous silent `?? 0` fallback is removed from the service; callers that want it apply it explicitly.

**Removed methods:** `refreshPriority`, `doRefreshPriority`, `getScrapingScore`. No deprecation period — internal API.

**No convenience wrapper.** No `recalculateAndPropagate` helper. Every caller writes the two-line sequence explicitly. Three call sites need both, two need only `recalculateScore`; the cost of duplication is lower than the cost of hiding a side-effect again.

**Caller-by-caller behavior:**

- `ProcessChannelEntryUseCase` — calls `recalculateScore` only; uses returned `scrapingScore` for `channelsQueue.enqueue`. No propagation (no PENDING jobs exist for a freshly-created channel).
- `PushChannelUseCase`, new-channel branch — boost → create entry → `recalculateScore` → `enqueue(channelId, scrapingScore)`. The current "`getScrapingScore` returns 0, enqueue with 0, then `refreshPriority` overwrites" sequence is replaced by a single recalc whose result feeds the enqueue. No propagation.
- `PushChannelUseCase`, existing-channel branch — `recalculateScore` then `propagatePriorityToPendingJobs(channelId, scrapingScore)`; returns `PRIORITIZED` with the propagation counts. Outward `PushChannelResult` shape preserved.
- `RecalculateAllPrioritiesUseCase` — per channel: `recalculateScore`; if ok, `propagatePriorityToPendingJobs(channelId, scrapingScore)`. A channel counts as failed if either step fails.
- `ChannelPriorityScheduler` — same two-call pattern as the bulk recalculate; logs an error if either step fails.
- `FindChannelsUseCase` (channel-discovery) — stops calling the priority service entirely. Enqueues the freshly-created `channelEntry` with literal `0`, with a one-line comment noting that the real score is written by `ProcessChannelEntryUseCase` once the channel row exists. At this point in the lifecycle the cache row provably cannot exist (no `channels` row, no boost — boost would have created the entry, which the early `findById` check would have skipped on), so the lookup was always returning `0`.
- `FindChannelVideosUseCase` (video-discovery) — calls `getStoredScrapingScore(channelId)` once and uses `value ?? 0` as the priority for every enqueued video entry in the run. The cache row should normally exist by this stage (`ProcessChannelEntryUseCase` ran earlier); the `?? 0` is an explicit defensive fallback.

**No convenience read wrapper.** No `getStoredScrapingScoreOrZero` helper. The single remaining call site that wants a numeric default writes `?? 0` inline; that explicitness is what we just paid the refactor cost to gain.

**No schema changes.** `channelPriorityScores`, `channels`, `channelJobs`, `videoDiscoveryJobs`, `videoJobs` are untouched.

**No formula changes.** `ChannelPriorityCalculator` is untouched.

**Stats query placement.** The `Promise.all` block that fetches `boostedChannels`, `channels.subscriberCount`, and the `videoJobs`/`videos` aggregate stays inline inside `recalculateScore`. Single caller; extracting a `ChannelStatsRepository` would add a file without clarifying anything. Revisit if a second caller appears.

**External API contracts preserved.** The Telegram `/push_channel` response payload (`PushChannelResult`) keeps the same shape, including the `updatedChannelJobs`, `updatedVideoDiscoveryJobs`, `updatedVideoJobs` fields used by the controller's reply formatter.

## Testing Decisions

**Test philosophy.** Tests assert externally observable behavior — the `Result` returned to the caller, the rows that end up in the database, and the counts reported back — not which private method was called or in what order.

**Modules under test:**

- `PushChannelUseCase` already has coverage for ADDED and PRIORITIZED-with-N-updated-jobs cases (`src/modules/scraping/push-channel/push-channel.use-case.test.ts`). Update mocks/stubs to target `recalculateScore` and `propagatePriorityToPendingJobs` rather than `refreshPriority` / `getScrapingScore`. The assertions on `PushChannelResult` shape and field values remain unchanged. New-channel test must verify the channel is enqueued with the recalculated `scrapingScore` (not with `0`).
- `ChannelPriorityService` itself does not currently have a dedicated unit test; none added in this PRD. Behavior is covered indirectly via the use-case tests that exercise it.

**Prior art.** Existing patterns in `push-channel.use-case.test.ts` — service mocks returning `Result` values, in-memory or stubbed repositories, assertions on final `Result` value plus side-effect counts — are the model to follow.

**Out of scope for tests.** No new tests for `RecalculateAllPrioritiesUseCase`, `ChannelPriorityScheduler`, or `ProcessChannelEntryUseCase` are introduced by this PRD; their behavior is preserved and covered by the current (likely manual / integration) verification flow.

## Out of Scope

- Adding a recalc step inside the discovery use cases (`FindChannelsUseCase`, `FindChannelVideosUseCase`). They remain pure cache-readers; recalc stays on the create-time + scheduler triggers.
- Changing the scoring formula or weights in `ChannelPriorityCalculator`.
- Changing the scheduler interval, the stale-channel selection query, or the per-tick batch size of 100.
- Changing the `channelPriorityScores` schema or adding new fields.
- Changing `searchScore` semantics or finding a consumer for it.
- Adding inline per-video priority refresh (the README explicitly calls this out as a non-goal today).
- Introducing a `ChannelStatsRepository` abstraction.
- Adding new unit tests for `ChannelPriorityService` itself.
- Reworking `BoostedChannelsRepository` or the `+500` boost semantics.

## Further Notes

- The cascade-as-no-op in `ProcessChannelEntryUseCase` was the trigger for noticing the conflation; verifying that "no PENDING jobs exist at channel-create time" relied on reading the use case sequentially (channel row created before any `videoDiscoveryJob` is enqueued, and the triggering `channelJob` is already claimed/IN_PROGRESS, not PENDING).
- README at `src/modules/scraping/channel-priority/README.md` references `refreshPriority()` in the "When scores are recalculated" section and must be updated as part of this work.
- Grep verification post-refactor: zero hits for `refreshPriority` and `getScrapingScore` across `src/`. `getStoredScrapingScore` should appear at exactly one call site (`FindChannelVideosUseCase`).
