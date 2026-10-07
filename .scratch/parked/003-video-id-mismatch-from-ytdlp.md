# How should the video scraper handle yt-dlp returning a different video id than the one requested? Today it causes duplicate-key failures on `videos_pkey` that stop the whole scraper loop, and it also marks some jobs SUCCEEDED by mistake. This applies to paid YouTube Originals videos, e.g. the "Bad Internet" channel `UCPDXXXJj9nax0fr0Wfc048g`.

**Parked:** 2026-10-07 · `main` @ `e8cdbb3`
**Where:** `src/modules/youtube-api/yt-api-get-video.ts`, `src/modules/youtube-api/yt-dlp-client.ts`, `src/modules/scraping/scrapers/video/use-cases/process-video-entry/process-video-entry.use-case.ts`, `src/modules/scraping/scrapers/video/video-entries.worker.ts`

## Doubt

`YoutubeApiGetVideo.getVideo` (src/modules/youtube-api/yt-api-get-video.ts) builds the video from `ytData.id`, the id yt-dlp returns, not from the `videoId` it requested. For paid episodes, YouTube (with prod's cookies) seems to redirect to the episode's free promo clip, so yt-dlp reports the clip's id. ProcessVideoEntryUseCase (src/modules/scraping/scrapers/video/use-cases/process-video-entry/process-video-entry.use-case.ts) then inserts under that id:
- If the clip is already in `videos`, the insert fails with 23505. DATABASE isn't a skip cause in `toSkipCause` (src/modules/scraping/scrapers/video/video-entries.worker.ts), so the job is marked FAILED and the scraper loop stops.
- If the episode is scraped before its clip, the clip gets saved under the episode's job, which is marked SUCCEEDED even though no `videos` row exists for the episode id. The clip's own job then fails later with a duplicate key.

## Sanity check

**holds**: `yt-api-get-video.ts:64` sets `id: ytData.id` while the requested `videoId` is only used for the URL and logs (lines 35, 127); `toSkipCause` in `video-entries.worker.ts:10` is the only mapping to skip causes and has no DATABASE case.

## Context

**Evidence gathered on prod 2026-10-07, read-only:**
- Failure 2026-10-07 00:35:11 UTC: the job for `NHZBH6QDym0` ran `yt-dlp --dump-json https://youtube.com/watch?v=NHZBH6QDym0`. The scraper logs show "Detected language: en. Video ID: NHZBH6QDym0", then "Processing and saving video DsvSSN72CDs.", then `Key (id)=(DsvSSN72CDs) already exists` on `videos_pkey`. `DsvSSN72CDs` ("What the Internet Is Like in the Future | CLIP FROM BAD INTERNET EP 10") had its own job, which succeeded on 2026-10-04 21:51.
- Earlier case, opposite order: the job for `K2ROYGwL1kU` succeeded on 2026-10-04 22:51:31, and the video saved at that time was `ANm0YaYRtO8` ("If Uber Controlled Your Body | CLIP FROM BAD INTERNET EP 8"). The job for `ANm0YaYRtO8` then FAILED at 22:52:23. On prod, `K2ROYGwL1kU` is the only SUCCEEDED job without a `videos` row, and `ANm0YaYRtO8` is the only FAILED job whose video exists.
- Local yt-dlp without cookies on `NHZBH6QDym0` and `K2ROYGwL1kU` returns `ERROR: This video requires payment to watch`. The redirect-to-clip behaviour with cookies is inferred and wasn't reproduced, because running yt-dlp on prod is outside the read-only prod skill allowlist.
- Proposed fix (not implemented): in `getVideo`, when `ytData.id !== videoId`, return a new unprocessable error (e.g. `PAID_VIDEO` or `REDIRECTED_VIDEO`). Wire it through `classifyUnprocessable` in src/modules/youtube-api/yt-dlp-client.ts and `toSkipCause`, and add a `video_job_skip_cause` enum value via a migration, so these jobs get SKIPPED. Also classify "requires payment to watch" the same way. Cleanup on prod: the `K2ROYGwL1kU` job is falsely SUCCEEDED; `NHZBH6QDym0` and `ANm0YaYRtO8` are FAILED.
- Unrelated thing noticed during this: 26 `video_jobs` have been stuck in PROCESSING since late September, and nothing in the code resets PROCESSING to PENDING.
- Prod tables are snake_case (`video_jobs`, `video_entries`, `videos`); Kysely uses CamelCasePlugin.
