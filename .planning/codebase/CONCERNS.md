# Codebase Concerns

**Analysis Date:** 2026-04-07

## Tech Debt

**Dead code — fully commented-out classes kept in source:**
- Issue: Three `_old.ts` files and the entire `youtube-api-client.ts` contain commented-out code that is no longer active. The files exist to preserve historical implementations after migration to yt-dlp but are never imported.
- Files:
  - `src/modules/youtube-api/youtube-api-client.ts` (entire file is commented out, 183 lines)
  - `src/modules/youtube-api/yt-api-get-video_old.ts` (entire file is commented out, 205 lines)
  - `src/modules/youtube-api/yt-api-get-channel-video-entries_old.ts` (entire file is commented out, 185 lines)
  - `src/modules/youtube-api/yt-api-search-channels-via-videos_old.ts` (entire file is commented out, 194 lines)
- Impact: Clutters IDE search results, may confuse future contributors, increases cognitive overhead during code review.
- Fix approach: Delete these files. Git history preserves the old implementations.

**Duplicate service file with debug statements committed:**
- Issue: `captions-similarity.service copy.ts` is a full copy of `captions-similarity.service.ts` with different algorithm constants and active `console.log` debug statements. Both files import `writeFileSync` from `fs` but neither uses it (unused import).
- Files:
  - `src/modules/scraping/scrapers/video/use-cases/process-video-entry/captions-similarity.service copy.ts`
  - `src/modules/scraping/scrapers/video/use-cases/process-video-entry/captions-similarity.service.ts`
- Impact: Space is wasted in the codebase. The "copy" file is never imported anywhere, but the active `captions-similarity.service.ts` also has a committed `console.log("debug: scores", scores)` at line 223 that will appear in production logs on every video processed with both caption types.
- Fix approach: Delete the `copy` file. Remove the debug `console.log` from the active service.

**Unused import (`writeFileSync`) in production code:**
- Issue: Both `src/modules/youtube-api/yt-api-get-video.ts` (line 13) and `src/modules/scraping/scrapers/video/use-cases/process-video-entry/captions-similarity.service.ts` (line 3) import `writeFileSync` from `fs` but never call it. This suggests debug file-writing code was removed but the import was not cleaned up.
- Files:
  - `src/modules/youtube-api/yt-api-get-video.ts`
  - `src/modules/scraping/scrapers/video/use-cases/process-video-entry/captions-similarity.service.ts`
- Impact: Minor — adds noise, may trigger linting warnings.
- Fix approach: Remove the unused imports.

**`HttpClient` is a singleton exposed via module-level export rather than DI container:**
- Issue: A singleton `httpClient` is exported directly from `src/modules/_common/http/index.ts` (line 174–182) with a hardcoded 5000 ms cooldown. It is consumed directly by `yt-api-get-video.ts` (bypassing DI) and the file has a `// TODO: remove singleton` comment. This means the HTTP cooldown is shared globally across all scrapers using this import path, and it is impossible to override config per-consumer in tests.
- Files:
  - `src/modules/_common/http/index.ts`
  - `src/modules/youtube-api/yt-api-get-video.ts` (imports `httpClient` directly)
- Impact: Cannot test HTTP-dependent code in isolation without the real HTTP client; unexpected cross-scraper timing interference if two code paths use the singleton concurrently.
- Fix approach: Bind `HttpClient` in the DI container with per-use-case configuration, then inject it where needed.

**`channel-info.extractor.ts` uses `as any` for deep property access:**
- Issue: The extractor casts the YouTube page JSON to `any` and accesses deeply nested optional properties via optional-chaining chains (e.g., `youtubeDataObject?.onResponseReceivedEndpoints?.[0]?.showEngagementPanelEndpoint?...`). The TODO comment at line 70 acknowledges this should use Zod instead.
- Files: `src/modules/youtube-api/extractors/channel-info.extractor.ts`
- Impact: Type safety is absent for this code path; YouTube API response structure changes will not be detected at compile time.
- Fix approach: Define a Zod schema for the raw YouTube response structure, as already done in other extractors.

**Commented-out validation logic in `ManualCaptionsValidator`:**
- Issue: Three steps of caption validation (normalize, merge, filter) are commented out at lines 32–38 of `manual-captions.validator.ts` with no explanation, leaving the validator checking only length and overlap.
- Files: `src/modules/scraping/scrapers/video/use-cases/process-video-entry/manual-captions.validator.ts`
- Impact: Validation may pass captions that should be filtered, affecting downstream quality of the captions database.
- Fix approach: Either re-enable these steps with a deliberate decision or delete the commented code and document why it was removed.

**Package scripts reference non-existent paths:**
- Issue: Several npm scripts in `package.json` reference paths that no longer exist, including `dist/src/modules/scrapers/...` (the `scrapers` directory is now `scraping` in source) and `src/index.ts` (entry point is `src/main.ts`). Examples: `run:channel-discovery`, `run:all`, `run:scrapers`, `run:channel`, `run:video-discovery`, `run:video`, `go:all`, `bot`.
- Files: `package.json`
- Impact: Running these scripts will fail at the Node.js level, not fail gracefully. Could mislead contributors.
- Fix approach: Update or remove stale scripts to match the current directory structure.

**`SyncDataToElasticUseCase` incremental sync does not actually sync data:**
- Issue: `performIncrementalSync` fetches data but returns it via `Success(dataToSync)` without calling `this.elasticSyncService.syncDataToElastic()`, while `performFullSync` does call it. The incremental path is effectively a no-op sync.
- Files: `src/modules/captions-search/sync-data-to-elastic.use-case.ts`
- Impact: After the first full sync, incremental syncs will silently do nothing — new captions added to the database will not be indexed in Elasticsearch.
- Fix approach: Call `this.elasticSyncService.syncDataToElastic(dataToSync)` in `performIncrementalSync` the same way `performFullSync` does.

**`getVideosForReprocessing` cursor uses lexicographic `id` ordering:**
- Issue: The `getVideosForReprocessing` async generator in `video.repository.ts` paginates with `.where("id", ">", lastVideoId)` and `.orderBy("id", "asc")`. If video IDs are UUIDs, lexicographic ordering is correct. However, this is never validated — if IDs were ever non-UUID strings, the pagination would silently skip or repeat records.
- Files: `src/modules/scraping/scrapers/video/video.repository.ts`
- Impact: Low risk if IDs are always UUID v4, but there is no enforced constraint or type check.
- Fix approach: Add a comment documenting the UUID assumption or add a type guard on the cursor value.

**`processVideo` in `ProcessVideoEntryUseCase` has a silent no-op when manual captions exist without auto captions:**
- Issue: At lines 107–113 of `process-video-entry.use-case.ts`, the code returns a `UNEXPECTED_STATE` failure if manual captions are non-empty but auto captions are empty. However, before that, the caption analysis service calls `captionsSimilarityService.calculateSimilarity` at line 55–66 of `caption-analysis.service.ts` synchronously, which can log and return early. But `processVideo` invokes `captionAnalysisService.analyze` before validating the manual/auto length constraint (lines 87–97 vs 107–113). This means the analysis runs even for cases that will ultimately fail.
- Files:
  - `src/modules/scraping/scrapers/video/use-cases/process-video-entry/process-video-entry.use-case.ts`
  - `src/modules/scraping/scrapers/video/use-cases/process-video-entry/caption-analysis.service.ts`
- Impact: Minor wasted computation; structural inconsistency making the code harder to reason about.
- Fix approach: Move the manual/auto caption length guard before the `captionAnalysisService.analyze` call.

**Hardcoded 5-second sleep in `yt-api-get-video.ts`:**
- Issue: Line 114 of `src/modules/youtube-api/yt-api-get-video.ts` has `await new Promise((resolve) => setTimeout(resolve, 1000 * 5))` hardcoded between the yt-dlp JSON fetch and the auto-captions HTTP fetch. There is also a matching 5-second sleep in `video-entries.worker.ts` (line 81) after each video is processed.
- Files:
  - `src/modules/youtube-api/yt-api-get-video.ts` (line 114)
  - `src/modules/scraping/scrapers/video/video-entries.worker.ts` (line 81)
- Impact: Two hardcoded sleeps in the critical path add 10 seconds minimum to each video scrape. These cannot be configured or disabled in tests.
- Fix approach: Make cooldown durations configurable via the `HttpClient` config or a dedicated rate-limiter service. Remove the magic `setTimeout` literals.

**`VideoEntriesQueue.getNextEntry` uses `random()` ordering:**
- Issue: Line 53 of `video-entries.queue.ts` uses `.orderBy(sql\`random()\`)` to pick the next pending video job. This is annotated with `// temporary things to discover more scenarios`. Random ordering requires a full table scan and sort on Postgres, which degrades significantly as the `videoJobs` table grows.
- Files: `src/modules/scraping/scrapers/video/video-entries.queue.ts`
- Impact: Query performance degrades O(n) with queue size. At large scale this becomes a bottleneck.
- Fix approach: Remove the random ordering once the exploration phase is complete; use a standard FIFO or priority-based selection instead.

## Known Bugs

**`console.log` debug statement in production caption similarity path:**
- Symptoms: Every video processed with both auto and manual captions emits `debug: scores [...]` to stdout/logs.
- Files: `src/modules/scraping/scrapers/video/use-cases/process-video-entry/captions-similarity.service.ts` (line 223)
- Trigger: Any video where both `autoCaptions` and `manualCaptions` are non-null.
- Workaround: None currently; log noise will occur in production.

**Elasticsearch `FindCaptionsUseCase` logs raw results via `console.log`:**
- Symptoms: Search results are logged to stdout as raw JSON rather than through the structured logger.
- Files: `src/modules/captions-search/find-captions.use-case.ts` (line 40)
- Trigger: Any search query execution.
- Workaround: None; output goes to stdout unstructured.

**`processCountryCode` in `channel-info.extractor.ts` uses `console.warn` instead of logger:**
- Symptoms: Unknown country names log via `console.warn` instead of the structured `Logger`, bypassing log formatting, context injection, and log file routing.
- Files: `src/modules/youtube-api/extractors/channel-info.extractor.ts` (line 222–225)
- Trigger: Any channel from a country not listed in `countryNameToCodeMap`.

## Security Considerations

**No input sanitization on Telegram bot command arguments:**
- Risk: Telegram bot controllers (`config.controller.ts`, `lifecycle.controller.ts`, `stats.controller.ts`) receive user input from Telegram messages. There is no validation layer shown for chat ID or message content before using it.
- Files:
  - `src/modules/scraping/telegram/config.controller.ts`
  - `src/modules/scraping/telegram/lifecycle.controller.ts`
  - `src/modules/scraping/telegram/stats.controller.ts`
  - `src/modules/telegram/telegram-bot.ts`
- Current mitigation: Chat ID is checked against `TELEGRAM_CHAT_ID` env var before processing messages (`telegram-bot.ts` line 37).
- Recommendations: Ensure all command parameters are validated before being passed to use cases.

**Environment secrets loaded via `process.env` without validation at startup:**
- Risk: `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` are read inside constructors of `TelegramBot` and throw bare `Error` objects if missing. `ES_NODE` in `FindCaptionsUseCase` defaults to `http://elasticsearch:9200` silently if unset. Other env vars (database connection, etc.) are presumably read at DB client instantiation.
- Files:
  - `src/modules/telegram/telegram-bot.ts`
  - `src/modules/captions-search/find-captions.use-case.ts`
- Current mitigation: Errors thrown at startup for Telegram credentials. ES falls back to a default.
- Recommendations: Centralize environment validation at app startup (e.g., using Zod or valibot) and fail fast with a clear error list before any connections are made.

## Performance Bottlenecks

**`getDataToSync` loads all captions into memory for full sync:**
- Problem: `ElasticCaptionsSyncRepository.getDataToSync()` calls `.execute()` which materializes all manual captions from the database into a single array before passing to `elasticSyncService.syncDataToElastic()`.
- Files: `src/modules/captions-search/elastic-captions-sync.repository.ts`
- Cause: No streaming/cursor-based pagination; a single SELECT loads the entire captions table filtered by type.
- Improvement path: Stream results in pages (e.g., using the cursor-based pattern already used in `getVideosForReprocessing`) and sync incrementally.

**`random()` ORDER BY in `VideoEntriesQueue.getNextEntry`:**
- Problem: (See Tech Debt section above.) Each call to dequeue the next video does a full table random sort.
- Files: `src/modules/scraping/scrapers/video/video-entries.queue.ts`
- Cause: Temporary exploratory ordering never removed.
- Improvement path: Replace with indexed FIFO ordering.

## Fragile Areas

**YouTube scraping relies on undocumented internal API structure:**
- Files:
  - `src/modules/youtube-api/extractors/channel-info.extractor.ts`
  - `src/modules/youtube-api/extractors/channel-videos.extractor.ts`
  - `src/modules/youtube-api/extractors/channel-video.exctractor.ts`
  - `src/modules/youtube-api/extractors/json-from-html.extractor.ts`
- Why fragile: All scrapers parse YouTube's internal JSON embedded in HTML pages or returned from undocumented endpoints. YouTube frequently changes its response structure without notice. A single field rename or schema change will cause validation failures across all channel/video discovery scrapers.
- Safe modification: Any change to schema validation (Zod schemas in `*.schemas.ts`) must be tested against real YouTube responses. The `_debug/captions/` directory contains raw API snapshots that serve as unofficial regression fixtures.
- Test coverage: Only `process-video-entry.use-case.test.ts` and `yt-api-get-video.test.ts` exist; the extractors themselves have no unit tests.

**Caption language detection depends on yt-dlp's `language` field:**
- Files: `src/modules/youtube-api/yt-api-get-video.ts` (lines 87–103)
- Why fragile: If yt-dlp does not populate the `language` field (returns `null`), the video is treated as having no captions or `MANUAL_ONLY`, even if auto-captions exist under a language code not matched by `isValidLanguageCode`. The `LanguageCode` enum (from `src/modules/i18n/index.ts`) defines the allowed set — if a video's language is not in this enum, captions are silently skipped.
- Safe modification: Adding new language codes requires updating the `LanguageCode` enum in `src/modules/i18n/index.ts` and re-running the `CAPTIONS_PROCESSING_ALGORITHM_VERSION` reprocess pass.

**`hasOverlappingTimestamps` in manual caption validation rejects valid captions:**
- Files: `src/modules/scraping/scrapers/video/use-cases/process-video-entry/manual-captions.validator.ts`
- Why fragile: The comment at line 61 notes "Valid manual captions can also be overlapping. But we have to see how often that's the case." This means the validator may incorrectly reject legitimate manual captions from channels whose subtitle format uses overlapping segments (e.g., word-level timing tracks).
- Safe modification: Any change to this validation logic will affect `captionsProcessingAlgorithmVersion` and requires a full reprocess run via the `run:reprocess-captions` script.

## Scaling Limits

**`transcriptionJobs` table has no consumer:**
- Current capacity: Jobs are enqueued into `transcriptionJobs` for `MANUAL_ONLY` videos (videos with manual captions but no auto captions).
- Limit: There is no worker to dequeue or process transcription jobs — the queue grows unboundedly and the `MANUAL_ONLY` videos never get auto captions resolved.
- Scaling path: Implement a transcription worker that reads from `transcriptionJobsQueue` and generates auto captions (e.g., via Whisper or another ASR service).

## Dependencies at Risk

**`youtube-search-api` package (v1.2.2):**
- Risk: Listed as a production dependency but appears unused after migration to yt-dlp. The current channel discovery flow uses `yt-api-search-channels-via-videos.ts` which relies on yt-dlp, not `youtube-search-api`.
- Impact: Dead dependency shipped in production; may have its own security vulnerabilities.
- Migration plan: Verify no remaining imports of `youtube-search-api`, then remove it from `package.json`.

**`zod` and `valibot` both present:**
- Risk: Both Zod (`^3.23.8`) and Valibot (`^0.37.0`) are listed as production dependencies. Core validation uses Zod; Valibot is imported in `src/modules/_common/validation/` but it is unclear if both are actively needed or if one is a leftover from an incomplete migration.
- Files: `src/modules/_common/validation/validator.ts`, `src/modules/_common/validation/types.ts`
- Impact: Two competing validation libraries increase bundle size and create inconsistency risk if contributors use the wrong one.
- Migration plan: Audit actual imports; remove whichever library is not actively used.

## Missing Critical Features

**No retry logic for failed video scraping jobs:**
- Problem: When a video job fails (network error, YouTube response change, etc.), it is marked `FAILED` via `markAsFailed` and the worker stops via `onError`. The only recovery mechanism is the `channelVideosHealth` streak guard which prevents processing more videos from the same channel after 5 failures, but the failed jobs themselves are never retried.
- Blocks: Transient failures (rate limiting, temporary network errors) permanently mark jobs as failed without any retry attempts.

**`TranscriptionJobsQueue` has enqueue but no dequeue:**
- Problem: `src/modules/scraping/scrapers/video/transcription-jobs.queue.ts` only implements `enqueue`. There is no `dequeue`, `markAsProcessing`, or consumer worker.
- Blocks: `MANUAL_ONLY` videos (those with manual but no auto captions) are enqueued for transcription but never processed. Their `captionStatus` stays `MANUAL_ONLY` indefinitely.

## Test Coverage Gaps

**Extractors have no unit tests:**
- What's not tested: All YouTube response parsing logic in `src/modules/youtube-api/extractors/` — including channel info, channel videos, channel video details, and search channels extractors.
- Files:
  - `src/modules/youtube-api/extractors/channel-info.extractor.ts`
  - `src/modules/youtube-api/extractors/channel-videos.extractor.ts`
  - `src/modules/youtube-api/extractors/channel-video.exctractor.ts`
  - `src/modules/youtube-api/extractors/search-channels-via-videos.extractor.ts`
  - `src/modules/youtube-api/extractors/search-channels-direct.extractor.ts`
- Risk: YouTube API structure changes break extraction silently until a run fails in production. No regression safety net.
- Priority: High

**Caption validation and similarity services have no unit tests:**
- What's not tested: `ManualCaptionsValidator`, `AutoCaptionsValidator`, `CaptionCleanUpService`, `CaptionSimilarityService` business logic.
- Files:
  - `src/modules/scraping/scrapers/video/use-cases/process-video-entry/manual-captions.validator.ts`
  - `src/modules/scraping/scrapers/video/use-cases/process-video-entry/auto-captions.validator.ts`
  - `src/modules/scraping/scrapers/video/use-cases/process-video-entry/caption-clean-up.service.ts`
  - `src/modules/scraping/scrapers/video/use-cases/process-video-entry/captions-similarity.service.ts`
- Risk: Algorithm version changes and caption quality decisions are unverified. A reprocess run could degrade caption quality without detection.
- Priority: High

**Worker lifecycle and orchestrator logic are not tested:**
- What's not tested: `ScraperOrchestrator`, all workers (`VideoEntriesWorker`, `ChannelEntriesWorker`, `ChannelsWorker`, `SearchChannelQueriesWorker`), and the `shouldContinue`/timeout logic.
- Files: `src/modules/scraping/scraper.orchestrator.ts`, `src/modules/scraping/scrapers/*/` workers
- Risk: Race conditions or logic bugs in stop/start/timeout handling will only be caught in production.
- Priority: Medium

---

*Concerns audit: 2026-04-07*
