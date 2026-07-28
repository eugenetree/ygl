# CONTEXT.md

Domain concepts that recur across this codebase but aren't obvious from any single file.

## Unprocessable video

A video that `yt-dlp` cannot process for an expected, non-fatal reason — the video itself is fine as a concept, it's just not retrievable right now (e.g. it's members-only, geo-restricted, age-restricted, a premiere that hasn't started, or has been removed by its uploader).

`classifyUnprocessable()` in [src/modules/youtube-api/yt-dlp-client.ts](src/modules/youtube-api/yt-dlp-client.ts) recognizes these conditions by matching known substrings in the `yt-dlp` error message and maps them to a typed `UnprocessableVideoError` (e.g. `MEMBERS_ONLY_VIDEO`, `GEO_RESTRICTED_VIDEO`, `AGE_RESTRICTED_VIDEO`, `PREMIERE_VIDEO`, `REMOVED_BY_UPLOADER_VIDEO`). Anything that doesn't match a known condition falls through as a generic `YT_DLP_ERROR`.

To add a new variant: add the message substring, a new error type in the `UnprocessableVideoError` union, a branch in `classifyUnprocessable()`, a corresponding skip cause (see below), and a migration adding the new value to the relevant Postgres enum.

## Skip cause

The recorded reason a job (`video_jobs` or `video_discovery_jobs`) was marked `SKIPPED` rather than `FAILED`. Skip causes represent expected conditions the worker already knows how to handle — recording one and moving on, rather than stopping.

This distinction matters for the worker loop: a `SKIPPED` result lets the worker continue to the next job, while a `FAILED` result stops the loop and requires investigation. See `toSkipCause()` in [src/modules/scraping/scrapers/video/video-entries.worker.ts](src/modules/scraping/scrapers/video/video-entries.worker.ts), which maps each `UnprocessableVideoError` type to its `VideoJobSkipCause` value.

Naming convention: error type is `<REASON>_VIDEO`, skip cause is `<REASON>` (no `VIDEO_` prefix) — e.g. `PREMIERE_VIDEO` → `PREMIERE`.

## Active channel

A channel with at least one video job still to finish — one that is `PENDING` or `PROCESSING`.

This is deliberately narrower than "a channel with work remaining". A channel whose videos have not been discovered yet has no video job rows at all, and so is **not** active despite all of its work lying ahead. Anything that surfaces active channels (e.g. the `/priority_active` bot command) will therefore omit a freshly pushed channel until video discovery has run for it.

_Avoid_: pending channel, unfinished channel.

## Drained channel

A channel with no video jobs left to finish — every discovered video has reached a terminal state (`SUCCEEDED`, `SKIPPED`, or `FAILED`).

Drained is not the same as fully captioned: a channel where every video was skipped is drained. It is the complement of [active](#active-channel) among channels that have been discovered.

_Avoid_: processed channel, completed channel, finished channel.

## Stranded job

A job that will never run again, yet is not in a terminal state — the scraper has no mechanism that will ever reach it.

There is no retry logic and no stale-job reaper anywhere in the scraping module; workers only ever claim `PENDING` rows. Three kinds of work strand:

- A `FAILED` job — nothing re-enqueues it.
- A `PROCESSING` job orphaned by a crashed worker — nothing resets it to `PENDING`.
- A `PENDING` video discovery job for a channel that fails the discovery gates — the claim query in `channels.queue.ts` additionally requires `videoCount` below the per-channel limit and a supported `countryCode`. Because `countryCode` is nullable and `NULL IN (...)` is never true, a channel with an unknown country strands here permanently.

Stranded work is invisible in priority ordering: a stranded channel can hold the highest score in the system and never advance. Distinguishing it from merely queued work needs the job counts, not the score.

_Avoid_: stuck job, orphaned job, dead job.
