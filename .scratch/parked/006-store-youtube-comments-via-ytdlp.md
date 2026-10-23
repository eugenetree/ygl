# Would it be useful for the app to fetch and store YouTube comments for the videos it scrapes, using yt-dlp's comment extraction (`--write-comments`, which puts a `comments` array into the `--dump-json` output), alongside the video metadata fetched in `src/modules/youtube-api/yt-api-get-video.ts`?

**Parked:** 2026-10-23 · `feature/store-raw-data` @ `eb854f1`
**Where:** `src/modules/youtube-api/yt-api-get-video.ts`, `src/modules/youtube-api/yt-dlp-response-recorder.ts`, `docs/adr/0004-yt-dlp-uses-a-po-token-provider-sidecar.md`, `CONTEXT.md`

## Doubt

None given beyond the user noticing yt-dlp can save comments and wanting to check whether that could be useful for the app. Nothing in the app uses comments today; `yt-api-get-video.ts` only stores `commentCount`.

## Sanity check

**holds**: comments are not used anywhere; `src/modules/youtube-api/yt-api-get-video.ts:156` only maps `comment_count` to `commentCount`, and no `--write-comments` flag appears in `src`. The question is open.

## Context

Raised while designing raw-data storage on `feature/store-raw-data`. Decided so far in that design (not yet implemented): for every video fetched, the full, untrimmed `yt-dlp --dump-json` output (the "raw video info", see the Raw data section of `CONTEXT.md`) will be stored in a dedicated Cloudflare R2 bucket at `<videoId>/video-info.json.gz`; raw json3 caption tracks are stored only for videos where both auto and manual tracks are fetched. The app is a YouTube caption search (search a phrase, get clips that play from that point); see `CONTEXT.md`. Things a cold reader should weigh: comments are not in the current `--dump-json` call (it needs `--write-comments`, which adds extra requests per video and slows fetching, which matters for the scraper's rate limits — see `docs/adr/0004-yt-dlp-uses-a-po-token-provider-sidecar.md`); the scraper fetches roughly 640 videos/day when running; the existing 14-day recorder is `src/modules/youtube-api/yt-dlp-response-recorder.ts`.
