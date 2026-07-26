# Codebase Concerns

**Analysis Date:** 2026-07-26

## Tech Debt

**Global HTTP Client Singleton:**
- Issue: Module-level singleton pattern for `httpClient` creates shared mutable state that violates dependency injection principles
- Files: `src/modules/_common/http/index.ts` (lines 178-186)
- Impact: Makes testing difficult, prevents per-instance request cooldown configuration, complicates cleanup during shutdown
- Fix approach: Remove the global singleton export; inject `HttpClient` instances through the DI container instead. Ensure all callers resolve via `container.get(HttpClient)`.

**Commented-Out YouTube API Client Code:**
- Issue: Entire `YoutubeApiClient` class is commented out (100+ lines), creating ambiguity about which methods are in use
- Files: `src/modules/youtube-api/youtube-api-client.ts` (lines 1-183)
- Impact: Dead code reduces clarity; unclear why it was replaced or if rollback is possible
- Fix approach: Either delete this file or document the replacement strategy. Use git history to understand the migration path, then clean up.

**Multiple Deprecated Extractor Files:**
- Issue: Three `*_old.ts` files for YouTube API extractors remain in codebase without clear removal timeline
- Files: `src/modules/youtube-api/yt-api-get-channel-video-entries_old.ts` (186 lines), `src/modules/youtube-api/yt-api-get-video_old.ts` (204 lines), `src/modules/youtube-api/yt-api-search-channels-via-videos_old.ts` (193 lines)
- Impact: Confusion about which implementations to use; maintenance burden if both need updates; no easy way to detect if old code is still called
- Fix approach: Audit call sites to confirm new extractors replace old ones fully. Run static analysis to detect any lingering imports of `*_old.ts` files. Delete after verification.

**Type Suppression Markers in Commented Code:**
- Issue: TypeScript error suppressions on commented-out code suggest incomplete migration or type system debt
- Files: `src/modules/youtube-api/youtube-api-client.ts` (lines 89, 115)
- Impact: Indicates unresolved type compatibility issues; may reappear if dead code is restored without fixing types
- Fix approach: Document why the original types couldn't be fixed, or resolve the underlying type mismatches before relying on suppressions.

**Mixed Validation Libraries:**
- Issue: Both `zod` (12+ files) and `valibot` (1 file) are used for schema validation; no clear guideline for which to use
- Files: `package.json` dependencies; validation usage scattered across `src/modules/youtube-api/` and `src/modules/_common/validation/`
- Impact: Increases dependency bundle size; confuses developers on validation approach; potential inconsistencies in error handling
- Fix approach: Standardize on one library (likely `zod` given adoption). Migrate existing `valibot` usage or formally document context-specific usage rules.

**Temporary Caption Processing Disabled:**
- Issue: Caption cleanup service has a disabled code path with no clear re-enablement plan
- Files: `src/modules/scraping/scrapers/video/use-cases/process-video-entry/caption-clean-up.service.ts` (line 57)
- Impact: Feature that should improve caption quality is bypassed indefinitely
- Fix approach: Either re-enable with expanded captions database, or remove the unused code path. Document decision in comments if intentionally disabled.

## Known Bugs

**Extractor Business Logic Leakage:**
- Symptoms: Extractors contain business logic that shouldn't be part of API parsing (caption type inference, priority-based selection)
- Files: `src/modules/youtube-api/extractors/channel-video.exctractor.ts` (lines 94-97, 198)
- Trigger: When extracting channel video details, caption classification happens in the extractor rather than in consuming service
- Workaround: Current code does work; refactor when consolidating extractor responsibilities
- Fix approach: Move business logic (caption pairing, type selection) to a service layer; extractors should only parse and validate raw data.

**Potential Incomplete Video Entry Processing:**
- Symptoms: Video entries with missing auto captions but present manual captions are skipped unless transcription is triggered
- Files: `src/modules/scraping/scrapers/video/use-cases/process-video-entry/process-video-entry.use-case.ts` (lines 113-126)
- Trigger: When `videoDto.autoCaptions.state === "ABSENT"` and `videoDto.manualCaptions.state === "PRESENT_NOT_FETCHED"`
- Workaround: Transcription queue is enqueued as fallback, but language detection for manual captions fails without auto caption *-orig key
- Fix approach: Implement alternative language detection for manual captions (e.g., ML-based lang detection or user hints) to avoid transcription dependency.

**yt-dlp Version Resolution Race Condition:**
- Symptoms: Boot can be unblocked by timeout even if yt-dlp binary is non-functional
- Files: `src/modules/youtube-api/yt-dlp-client.ts` (lines 57-58, 113-130)
- Trigger: Binary resolves version successfully but later fails during actual video processing
- Workaround: Errors caught at runtime during video processing; fallback handling re-attempts
- Fix approach: Implement a full health check during client initialization (not just `--version`); fail fast if binary is unusable.

## Security Considerations

**Database Credentials in Connection String:**
- Risk: PostgreSQL password passed via `process.env.POSTGRES_PASSWORD` to connection pool. If environment is leaked, database is compromised.
- Files: `src/db/client.ts` (lines 16)
- Current mitigation: Relies on `.env` file being gitignored and environment variables being sourced securely in deployment
- Recommendations: Ensure production deployment never logs connection strings. Use connection pooling secrets (e.g., AWS Secrets Manager, HashiCorp Vault) for sensitive deployments. Audit Docker image build logs to confirm credentials aren't baked in.

**yt-dlp Cookies in Base64 Environment Variable:**
- Risk: `YTDLP_COOKIES_B64` environment variable stores base64-encoded authentication cookies; if leaked, YouTube account access is compromised
- Files: `src/modules/youtube-api/yt-dlp-client.ts` (lines 85-94)
- Current mitigation: Temporarily written to filesystem, not persisted; requires rebuild to rotate
- Recommendations: Add cookie rotation mechanism. Consider sourcing cookies from external secret store. Log cookie usage (without values) for audit trails.

**YouTube Inner Tube API Key Extraction:**
- Risk: API key is extracted from HTML and hardcoded into queries; while this key may be rate-limited to web origin, it's still a shared secret
- Files: `src/modules/youtube-api/extractors/channel-video.exctractor.ts` (lines 32-44)
- Current mitigation: Key is extracted per request; no long-term storage
- Recommendations: Monitor YouTube API's stance on InnerTube key usage. Implement request signing if YouTube adds HMAC authentication. Plan fallback if key pattern changes.

**No Input Sanitization on Channel/Video IDs:**
- Risk: User-provided IDs (videoId, channelId) passed directly to URL construction and database queries
- Files: `src/modules/youtube-api/yt-api-get-video.ts` (line 35), `src/modules/youtube-api/yt-api-get-channel.ts`
- Current mitigation: URL encoding via `encodeURI()`, but no strict validation of ID format
- Recommendations: Add strict regex validation for YouTube ID formats before processing. Validate at API entry point and repository layer.

**Telegram Bot Token in Environment:**
- Risk: `TELEGRAM_BOT_TOKEN` likely stored in environment; if CI/CD logs are leaked, bot is compromised
- Files: `src/modules/telegram/telegram-bot.ts`
- Current mitigation: Not hardcoded; sourced from environment
- Recommendations: Rotate token if any logs are ever exposed. Use Telegram's bot API rate limiting to detect suspicious activity.

## Performance Bottlenecks

**Synchronous Caption Similarity Computation:**
- Problem: Levenshtein distance calculated for every caption token pair; no memoization or early exit for obvious mismatches
- Files: `src/modules/scraping/scrapers/video/use-cases/process-video-entry/captions-similarity.service.ts` (426 lines, especially lines 65-84)
- Cause: Algorithm scans full caption transcript (3000ms ± window) for each token; O(n²) complexity in token count
- Current impact: Long video captions with many tokens can take seconds per video
- Improvement path: Add fuzzy matching bounds before Levenshtein (e.g., length check); cache common token pairs; parallelize token processing if needed; consider ngram-based pre-filtering.

**Database Pool Hardcoded at 10 Connections:**
- Problem: Fixed pool size of 10 may bottleneck under concurrent scraper load
- Files: `src/db/client.ts` (line 18)
- Cause: No connection pool scaling or monitoring; all scrapers compete for same 10 slots
- Current impact: Slow queries during peak scraping can exhaust pool and block subsequent queries
- Improvement path: Make pool size configurable via environment. Add pool monitoring (active/idle counts). Implement connection timeout and retry logic.

**Channel Priority Recalculation On Scheduler Tick:**
- Problem: 100 channels recalculated synchronously every 5 minutes; each recalc may trigger multiple database queries
- Files: `src/modules/scraping/channel-priority/channel-priority.scheduler.ts` (lines 62-90)
- Cause: Serial `for` loop over channels; no parallelization or batching
- Current impact: Scheduler ticks can block other operations if channels are computationally expensive
- Improvement path: Batch recalculations into fewer SQL queries. Parallelize with `Promise.all()`. Consider moving to background job queue (e.g., Bull, RabbitMQ).

**HTTP Request Queuing Blocks Parallelism:**
- Problem: All HTTP requests serialized by global `globalState.queue` to enforce cooldown; no parallel request support
- Files: `src/modules/_common/http/index.ts` (lines 26-32, 71-98)
- Cause: Single global promise chain enforces strict request ordering
- Current impact: YouTube API calls that could run in parallel (different channels) are delayed by cooldown between unrelated requests
- Improvement path: Use per-host request queues instead of global queue. Implement exponential backoff with jitter for rate limiting. Consider http-agent pool for connection reuse.

**Large Language Code Lookup Object:**
- Problem: `i18n/index.ts` contains 500+ lines of country/language code mappings; likely loaded into memory for every request
- Files: `src/modules/i18n/index.ts` (529 lines)
- Cause: All codes defined as JavaScript objects; no lazy loading or external file reference
- Current impact: Negligible for small deployments; scales poorly if `isValidLanguageCode()` is hot path
- Improvement path: Extract to separate JSON file and load once at startup. Use Set for O(1) lookups instead of object iteration if needed.

## Fragile Areas

**Caption Analysis Service with Complex State:**
- Files: `src/modules/scraping/scrapers/video/use-cases/process-video-entry/captions-similarity.service.ts` (426 lines)
- Why fragile: Algorithm relies on precise time window tuning (SHIFT_SCAN_MIN_MS, FUZZY_THRESHOLD). Minor changes in constants can break matching for edge cases. Multiple heuristics (text replacement, stop words, time tolerance) interact in non-obvious ways.
- Safe modification: Add comprehensive tests for edge cases (silent videos, very short captions, overlapping timestamps). Document each constant and its impact. Add observability (log matching scores, mismatches). Consider extracting sub-algorithms to separate functions.
- Test coverage: `captions-similarity.service.test.ts` exists (1542 lines); verify it covers all constant variations.

**YouTube Extractor Type Mismatches:**
- Files: `src/modules/youtube-api/extractors/channel-video.exctractor.ts`, `src/modules/youtube-api/extractors/channel-info.extractor.ts`
- Why fragile: Schema definitions (`inputSchemas.*`, `outputSchemas.*`) must align precisely with YouTube HTML/JSON structure. YouTube changes structure → extractors break silently (returning `Failure`). No integration tests against real YouTube pages.
- Safe modification: Add snapshot tests with real YouTube HTML samples. Document YouTube structure assumptions in comments. Add version markers for HTML/JSON formats. Implement schema migration strategy if YouTube changes structure.
- Test coverage: Unit tests exist but only verify schema validation logic, not real YouTube structure compatibility.

**Database Migration History:**
- Files: `src/db/migrations/` (46+ migration files)
- Why fragile: Long migration chain means new deployments run 46+ sequential SQL operations. Any single migration failure blocks deployment. No rollback tests or dry-run validation.
- Safe modification: Add migration verification script that runs on startup (checks schema state matches expected state). Document dependencies between migrations. Test rollback of recent migrations. Consider squashing old migrations after deployment stability.
- Test coverage: `seed-dev.test.ts` uses pg-mem for in-memory testing but doesn't validate full migration chain.

**Process Video Entry Use Case Conditional Logic:**
- Files: `src/modules/scraping/scrapers/video/use-cases/process-video-entry/process-video-entry.use-case.ts` (138 lines)
- Why fragile: Complex conditional logic determines caption persistence and transcription enqueueing (lines 74-126). Three different caption states (FETCHED, PRESENT_NOT_FETCHED, ABSENT) × two types (auto/manual) = 6 combinations with different outcomes. Changing one condition can silently break another path.
- Safe modification: Extract caption decision logic to pure functions with explicit test matrix. Document each state transition. Add decision logs (what state combination led to which action).
- Test coverage: `process-video-entry.use-case.test.ts` (444 lines) exists; verify all 6 state combinations are tested.

## Scaling Limits

**Single PostgreSQL Connection Pool:**
- Current capacity: 10 concurrent connections
- Limit: Scraper burst load (4 scrapers + API + Bot each making queries) can exceed 10 simultaneous connections
- Scaling path: Increase pool size based on deployment size. Implement query batching to reduce connection count. Consider read replicas for read-heavy queries (stats, channel info). Monitor connection pool utilization.

**Elasticsearch Indexing During Scrape:**
- Current capacity: Real-time caption sync happens during scraping; no batching
- Limit: High scrape throughput (100+ videos/min) can overwhelm Elasticsearch cluster with individual index operations
- Scaling path: Implement batch indexing (queue captions, flush every N items or every M seconds). Add Elasticsearch cluster health checks. Implement backpressure (slow scrape if ES is unavailable).

**File System Temp Storage for yt-dlp:**
- Current capacity: Each video extraction creates temp directory (line 1 in yt-api-get-video.ts)
- Limit: Rapid concurrent video processing exhausts /tmp or system disk
- Scaling path: Monitor temp directory usage. Implement cleanup on error (not just success). Use dedicated temp volume with quota. Consider piping yt-dlp JSON directly instead of temp files.

**Telegram Bot Single Connection:**
- Current capacity: Telegram outbound messages sent sequentially per chat
- Limit: High volume of notifications can queue and cause delivery delays
- Scaling path: Implement message batching (e.g., "50 videos scraped" instead of 50 individual messages). Use webhook instead of polling for incoming commands.

## Dependencies at Risk

**ytdlp-nodejs Wrapper:**
- Risk: Wrapper adds abstraction over yt-dlp binary; upstream ytdlp-nodejs may lag behind yt-dlp releases; version bump could introduce breaking changes
- Files: `src/modules/youtube-api/yt-dlp-client.ts`, `package.json` (^3.4.2)
- Current mitigation: Known bug already documented in comments (line 114-118) about wrapper version method; code works around it
- Impact: If wrapper author abandons project, security patches may not be available
- Migration plan: Document approach to spawn yt-dlp directly (already partially implemented in `resolveVersionFromBinary`). Prepare fallback to raw `spawn()` calls. Consider maintaining custom wrapper fork.

**YouTube Search API Package:**
- Risk: `youtube-search-api` (v1.2.2) is unmaintained (last update ~2020); YouTube API changes may break package
- Files: Used in channel discovery; exact usage requires grep of imports
- Current mitigation: Yt-dlp is primary extraction method; youtube-search-api is secondary
- Impact: If YouTube changes search results page structure, channel discovery can fail
- Migration plan: Replace with yt-dlp's `ytsearch:` prefix feature (already supported). Remove dependency after migration.

**Inversify Dependency Injection (v7.9.1):**
- Risk: Heavy framework dependency; new TypeScript versions may require reflect-metadata version bump
- Files: Core DI throughout `src/modules/`, decorators on injectable classes
- Current mitigation: Pinned versions in package.json
- Impact: TypeScript upgrade can break decorators if reflect-metadata API changes
- Migration plan: Evaluate native TS 5.0+ decorators as alternative. Document current reflect-metadata version compatibility. Plan migration timeline.

**Zod vs Valibot Validation:**
- Risk: Two validation libraries increases maintenance surface; Valibot is newer/less stable
- Files: Mentioned in package.json; mixed usage in extractors
- Impact: Confusion about which library to use for new schemas; potential inconsistency in error handling
- Migration plan: Commit to Zod as primary; remove Valibot or formally document Valibot-only use cases.

## Missing Critical Features

**No Graceful Shutdown Mechanism for Workers:**
- Problem: Workers (channel, video, discovery) may be processing a queue item when shutdown signal is received; can lose partial work
- Blocks: Clean deployment, zero-downtime upgrades
- Fix approach: Implement per-worker shutdown hooks that finish current item and flush any buffered writes before closing.

**No Observability for Caption Similarity Algorithm:**
- Problem: Captions similarity matching scores, mismatches, and performance metrics are not exposed
- Blocks: Debugging caption quality issues, optimizing algorithm parameters
- Fix approach: Add structured logging for matching decisions (score, shift, tokens matched). Implement metrics export (Prometheus, CloudWatch).

**No Health Check Endpoint:**
- Problem: No single endpoint to verify scraper, database, YouTube API, and Elasticsearch are accessible
- Blocks: Load balancer health checks, deployment verification, monitoring
- Fix approach: Add `GET /health` endpoint to API server; check database connectivity and dependency status.

**No API Authentication/Authorization:**
- Problem: API endpoints (`src/modules/api/`) likely accept any request without authentication
- Blocks: Production deployment in shared environments; prevents unauthorized access
- Fix approach: Implement JWT or API key auth. Scope permissions per endpoint (read captions, write config, etc.).

**No Database Backup/Recovery Procedures:**
- Problem: No documented backup strategy; schema evolution risk with 46+ migrations
- Blocks: Disaster recovery, point-in-time restore
- Fix approach: Document backup strategy (frequency, retention, verification). Test restore procedure regularly. Consider pg_dump automation.

## Test Coverage Gaps

**Untested YouTube Extractor Edge Cases:**
- What's not tested: Real YouTube HTML structure changes; malformed captions tracks; missing or null fields in ytData response
- Files: `src/modules/youtube-api/extractors/*.extractor.ts`
- Risk: Edge cases fail silently in production; users see "captions not found" without visibility into why
- Priority: High — extractors are critical path

**Untested Caption Similarity Token Matching:**
- What's not tested: Very long captions (10,000+ tokens); captions with special characters (emojis, accents); rapid time shifts
- Files: `src/modules/scraping/scrapers/video/use-cases/process-video-entry/captions-similarity.service.ts`
- Risk: Slow or incorrect matching on real-world captions; algorithm assumptions break on edge cases
- Priority: High — affects caption quality

**Untested Database Migration Rollback:**
- What's not tested: Applying migration, then rolling back, then re-applying; data integrity after rollback
- Files: `src/db/migrations/*`, `src/db/scripts/rollback-migration.ts`
- Risk: Rollback corrupts data or fails to restore schema; deployment gets stuck
- Priority: Medium — only matters during incidents

**Untested Scraper Orchestrator Shutdown:**
- What's not tested: Shutdown during worker processing; graceful vs. forced shutdown behavior
- Files: `src/modules/scraping/scraper.orchestrator.ts` (lines 118-120)
- Risk: In-flight work lost; partial data written to database
- Priority: Medium — impacts data consistency

**Untested Error Propagation in Process Scraper Failure:**
- What's not tested: Cascade failures (e.g., Telegram notification fails while DB write succeeds); error categorization
- Files: `src/modules/scraping/error-handling/process-scraper-failure.use-case.ts`
- Risk: Silent failures; errors not logged/reported consistently
- Priority: Medium — affects observability

---

*Concerns audit: 2026-07-26*
