# Should the scraper save the list of caption tracks available for each video (every key under yt-dlp's `subtitles` and `automatic_captions`, with each track's `name`, e.g. "English - CC1", and its URL params such as `name=CC1`), not just the one track it downloads?

**Parked:** 2026-10-15 · `bugfix/auto-captions` @ `eb854f1`
**Where:** `src/modules/youtube-api/yt-api-get-video.ts`, `src/modules/youtube-api/yt-api-get-video.schemas.ts`, `src/modules/youtube-api/yt-dlp-response-recorder.ts`, `src/modules/youtube-api/extractors/channel-video.exctractor.ts`

## Doubt

Right now nothing records which tracks a video had or which one was chosen, so questions about past scrapes can't be answered from the data:
- Manual track selection in `src/modules/youtube-api/yt-api-get-video.ts` (`findMatchingKey`) takes the first key that prefix-matches the language. For video `paUibKBGJNs`, yt-dlp lists two manual tracks under opaque keys, `en-uYU-mmqFLq8` (English - CC1) and `en-JkeT_87f4cc` (English - DTVCC1), and the CC1 broadcast track was fetched and stored (all-caps text with `>>>` markers, status CAPTIONS_HAS_OVERLAPPING_TIMESTAMPS). Whether CC1 or DTVCC1 wins depends on yt-dlp's key order.
- The schema in `src/modules/youtube-api/yt-api-get-video.schemas.ts` (around line 19) keeps only `ext` and `url` for each track and drops `name`. So for videos scraped before the raw yt-dlp recorder existed, whether the stored manual captions came from a CC1/DTVCC1 broadcast track can only be guessed from the text (all caps, `>>`).
- The raw yt-dlp responses (`src/modules/youtube-api/yt-dlp-response-recorder.ts`) are kept on prod for only 14 days. That's not a durable record.

## Sanity check

**holds**: `yt-api-get-video.schemas.ts:19-28` and `:29-38` declare each track as only `{ ext, url }` (no `name`), and `findMatchingKey` at `yt-api-get-video.ts:336-353` returns the first exact/prefix match over `Object.entries` with no track-name check; the chosen key is used at `yt-api-get-video.ts:193`. The CC1/DTVCC1 exclusion exists only in the old extractor at `extractors/channel-video.exctractor.ts:99-102` and `:203-206`.

## Context

The old HTML-scraping extractor `src/modules/youtube-api/extractors/channel-video.exctractor.ts` (lines ~98 and ~202) excluded CC1/DTVCC1 "live broadcast" tracks. It's dead code: its only imports, in `yt-api-get-video_old.ts:13` and `youtube-api-client.ts:7`, are commented out. That exclusion was lost when the scraper moved to yt-dlp. A related but separate decision is whether to skip broadcast tracks again when picking the manual key. This parked question is about storing the track list, which would make that and similar questions answerable after the fact. The current branch is bugfix/auto-captions, investigating auto captions stored as block-level text for 2,088 videos scraped Oct 2-7, 2026, which turned out to be a change on YouTube's side.
