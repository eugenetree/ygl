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
