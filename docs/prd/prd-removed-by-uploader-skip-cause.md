# PRD: `REMOVED_BY_UPLOADER` skip cause for video jobs

## Problem Statement

When a video gets queued into `video_jobs` (during channel discovery) but the uploader removes it from YouTube before the per-video scrape job actually runs, `yt-dlp` exits with a non-zero code and a message like:

```
WE8b6dbG9bE: Video unavailable. This video has been removed by the uploader
```

Today this is not recognized as an expected condition. It falls through as a generic, unclassified `YT_DLP_ERROR`, and the video worker treats any unrecognized error as fatal: it marks the job `FAILED` and **stops the entire scraper loop**. A routine, expected occurrence (uploaders remove their own videos all the time) takes down the whole scraping process and requires manual intervention to restart — even though nothing is actually broken.

## Solution

Recognize "removed by the uploader" as a known, non-fatal, unprocessable-video condition — the same way the scraper already recognizes members-only, geo-restricted, age-restricted, and premiere videos. When `yt-dlp` reports this specific message, the job is marked `SKIPPED` with a new `REMOVED_BY_UPLOADER` skip cause, and the scraper continues to the next job in the queue without stopping.

## User Stories

1. As a scraper operator, I want videos removed by their uploader to be skipped automatically, so that the scraper doesn't stop processing the rest of the queue over a single gone video.
2. As a scraper operator, I want a `video_jobs` row for a removed video to end up in a terminal, clearly-labeled state (`SKIPPED` / `REMOVED_BY_UPLOADER`), so that I can distinguish "this video is gone, nothing to do" from "this job actually failed and needs investigation."
3. As a scraper operator, I want the scraper to keep running unattended overnight without crashing on routine video removals, so that I don't have to manually restart it every time a video disappears.
4. As a scraper operator, I want other, unrecognized `yt-dlp` errors to still stop the scraper, so that genuinely new or unexpected failure modes (auth issues, rate limiting, yt-dlp breakage) still surface and get investigated rather than being silently swallowed.
5. As a developer maintaining this codebase, I want the new "removed by uploader" handling to follow the exact same classification pattern already used for members-only/geo-restricted/age-restricted/premiere videos, so that the codebase has one consistent way of handling "expected, unprocessable video" conditions instead of several different ones.
6. As a developer maintaining this codebase, I want the new skip cause's naming to follow the existing `<REASON>_VIDEO` (error type) / `<REASON>` (skip cause) symmetry, so that the skip cause column stays self-consistent and grep-able.
7. As a developer extending this codebase later, I want this PRD to scope the fix to only the exact message actually observed in production logs, so that I'm not guessing at unverified message strings for other YouTube unavailability variants (private, terminated account, ToS/policy removal).
8. As a developer extending this codebase later, I want a clear precedent for adding further unavailability variants as their own distinct skip causes (not lumped into one bucket), so that future additions are quick, low-risk, one-line changes — exactly like the four prior additions.
9. As a developer running the test suite, I want unit test coverage for the new classification and skip-cause mapping, so that a future refactor of `classifyUnprocessable()` or `toSkipCause()` can't silently break this behavior.
10. As a developer onboarding onto this codebase, I want the "unprocessable video" / "skip cause" domain concept documented in a `CONTEXT.md`, so that I don't have to reverse-engineer this pattern from five near-identical error branches scattered across two files.
11. As a future maintainer querying the `video_jobs` table, I want the `skip_cause` enum value to read unambiguously as "uploader removed this video" (not a generic "unavailable" bucket), so that database queries and dashboards built on `skip_cause` stay precise as more causes are added over time.

## Implementation Decisions

- **Classification** is added to the existing `classifyUnprocessable()` function in the YouTube/yt-dlp client module — this function already owns message-based classification of expected, unprocessable-video conditions (members-only, geo-restricted, age-restricted, premiere) and the new case follows the identical shape: a known message substring maps to a new typed error.
- **New error type**: `REMOVED_BY_UPLOADER_VIDEO`, added to the existing `UnprocessableVideoError` union (alongside `MEMBERS_ONLY_VIDEO`, `GEO_RESTRICTED_VIDEO`, `AGE_RESTRICTED_VIDEO`, `PREMIERE_VIDEO`). Matched via `message.includes("This video has been removed by the uploader")` — a substring match, so it doesn't matter that the real yt-dlp message is prefixed with the video ID (e.g. `"WE8b6dbG9bE: Video unavailable. This video has been removed by the uploader"`).
- **New skip cause**: `REMOVED_BY_UPLOADER`, added to the `VideoJobSkipCause` enum (alongside `MEMBERS_ONLY`, `GEO_RESTRICTED`, `AGE_RESTRICTED`, `PREMIERE`). Naming follows the established `<REASON>_VIDEO` (error type) / `<REASON>` (skip cause, no `VIDEO_` prefix) symmetry already used by all four existing causes.
- **Schema change**: a new reversible Postgres migration adds `REMOVED_BY_UPLOADER` to the `video_job_skip_cause` enum via `ALTER TYPE ... ADD VALUE`, with a `down()` that recreates the enum without it (re-mapping any existing `REMOVED_BY_UPLOADER` rows to `NULL`) — identical mechanics to the three prior skip-cause-adding migrations.
- **Worker mapping**: the video worker's `toSkipCause()` function gets one more branch mapping `REMOVED_BY_UPLOADER_VIDEO` → `REMOVED_BY_UPLOADER`. No other worker logic changes — the existing skip-and-continue branch already handles any recognized skip cause generically (mark `SKIPPED`, `continue`, don't stop the loop).
- **Scope is intentionally narrow**: only the one message actually observed in production ("removed by the uploader") is classified now. Other YouTube unavailability variants (private video, terminated account, content removed for ToS/policy violation) are explicitly **not** added speculatively — they'll be added later as their own distinct skip causes if/when they're actually observed in logs, following the same one-cause-per-migration pattern used historically (members-only → geo-restricted → age-restricted → premiere, each added independently over time).
- **No retry mechanism** is introduced. Consistent with all existing skip causes, a job marked `SKIPPED` with `REMOVED_BY_UPLOADER` is terminal — there is no existing retry/dead-letter mechanism for video jobs, and this PRD doesn't add one.
- **Other `YT_DLP_ERROR`s are unaffected** — anything that doesn't match a known classification (this one or the four pre-existing ones) still falls through as a fatal `YT_DLP_ERROR`, marks the job `FAILED`, and stops the scraper. This is intentional: unrecognized failures may indicate real problems (auth, rate limiting, yt-dlp breakage) that warrant human attention.
- **Documentation**: a new root-level `CONTEXT.md` is created (none currently exists in the repo) capturing two domain terms that recur across both video jobs and video-discovery jobs: **"Unprocessable video"** (a video `yt-dlp` cannot process for an expected, non-fatal reason) and **"Skip cause"** (the recorded reason a job was marked `SKIPPED` rather than `FAILED`; skip causes never stop the worker loop, `FAILED` results do).
- **No ADR** is written for this change — it's not hard to reverse, not surprising given four prior precedents, and involves no real architectural trade-off; the existing pattern fully dictates the approach.

## Testing Decisions

- Good tests here assert observable behavior (what error type/skip cause comes out for a given input message, and that the worker skips-and-continues rather than stops) — not internal implementation details of how the message matching is performed.
- **New test file** for the yt-dlp client's classification logic: asserts that a message containing `"WE8b6dbG9bE: Video unavailable. This video has been removed by the uploader"` classifies to the new `REMOVED_BY_UPLOADER_VIDEO` error.
- **New test file** for the video worker's skip-cause mapping: asserts `toSkipCause("REMOVED_BY_UPLOADER_VIDEO")` returns `"REMOVED_BY_UPLOADER"`, and/or that running the worker with a mocked use-case returning this error results in the job being marked skipped (not failed) and the loop continuing rather than stopping.
- **Prior art**: `process-video-entry.use-case.test.ts` and `video-entries.queue.test.ts` (both under `src/modules/scraping/scrapers/video/`) establish the existing conventions — plain `node:test` (`describe`/`it`/`beforeEach`/`mock`) with `node:assert/strict`, no external test framework. New tests should follow this same style.
- Note: neither the yt-dlp client's classification function nor the worker's skip-cause mapping currently has *any* test coverage (not even for the four pre-existing causes) — this PRD's tests will be the first coverage for this logic.
- Run via the existing `npm test` script (`node --test --import tsx "src/**/*.test.ts"`), no new tooling required.

## Out of Scope

- Other YouTube unavailability message variants (private video, terminated uploader account, content removed for ToS/policy violation) — explicitly deferred until actually observed in production logs.
- Any retry or dead-letter mechanism for skipped or failed video jobs.
- Changing how *any other* `YT_DLP_ERROR` is handled — all other unrecognized yt-dlp failures continue to stop the scraper as today.
- Any change to `video_entries.availability` (`PUBLIC` / `MEMBERS_ONLY`) — that's a separate, discovery-time concept unrelated to a video being removed after the fact.
- An ADR for this change (explicitly decided against — see Implementation Decisions).

## Further Notes

This PRD originated from a production incident: a `video_jobs` row referencing video ID `WE8b6dbG9bE` caused the scraper to stop with an unclassified `YT_DLP_ERROR` once the uploader removed the video from YouTube. The fix mirrors a pattern the codebase has already applied four times independently (members-only, geo-restricted, age-restricted, premiere), each added in its own migration as it was encountered in practice — this is simply the fifth instance of that same pattern, not a new mechanism.
