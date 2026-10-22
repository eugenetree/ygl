# Should the scraper reject block-level auto caption tracks at scrape time, setting a new `AutoCaptionsStatus` (e.g. `CAPTIONS_BLOCK_LEVEL`, alongside the existing values in `src/db/types.ts` and `src/modules/scraping/scrapers/video/video.ts`) for the whole track, so such tracks are never stored as captions? And where should the detection live: in `src/modules/youtube-api/extractors/captions.extractor.ts` (or the extractor returning a flag), or in `src/modules/scraping/scrapers/video/use-cases/process-video-entry/auto-captions.validator.ts`?

**Parked:** 2026-10-22 · `bugfix/auto-captions` @ `1f2c3cc`
**Where:** `src/modules/youtube-api/extractors/captions.extractor.ts`, `src/modules/scraping/scrapers/video/use-cases/process-video-entry/auto-captions.validator.ts`, `src/modules/scraping/scrapers/video/use-cases/process-video-entry/caption-analysis.service.ts`, `src/db/types.ts`, `src/modules/scraping/scrapers/video/video.ts`

## Doubt

Between 2026-10-02 and 2026-10-07, yt-dlp returned "block-level" auto caption tracks for about 2,088 videos: json3 events whose segs are phrases (sometimes containing "\n") with no `tOffsetMs` on any segment, instead of the usual word-level segs with per-word offsets. The extractor treats a missing `tOffsetMs` as 0, so in such a track every segment of an event starts at the event's start, and no word timing inside the block exists. The user decided these tracks should be blocked (status set, captions not stored) rather than stored with block-wide windows, and that this is a separate change from the current branch.

## Sanity check

**holds**: `AutoCaptionsStatus` exists (`src/db/types.ts:39`) with no block-level value, and the extractor defaults a missing offset to 0 (`src/modules/youtube-api/extractors/captions.extractor.ts:103`, `:107`). `auto-captions.validator.ts:19-54` only receives `CaptionSegment[]` (EMPTY / TOO_SHORT checks), so it cannot see whether offsets were present. Nothing in the code already settles the placement.

## Context

- The check must be per track, not per segment. YouTube omits `tOffsetMs` whenever it is 0, and a word-level second word can legitimately sit at offset 0 (video 5ulGRph203M, event tStartMs 419819: segs "IL", " when" with no offset, " it" at 301; fixture `src/fixtures/captions/raw/second_word_at_offset_0_auto.json`). Proposed signal: no event in the track has a non-first segment with a `tOffsetMs`.
- A per-segment rule in `eventSchema` would be silently harmful: events failing `eventSchema` are dropped without any report (`flatMap(... success ? [data] : [])` in the extractor).
- Precedent for track-level statuses: `CAPTIONS_MISSING_DURATIONS` in `src/modules/scraping/scrapers/video/use-cases/process-video-entry/manual-captions.validator.ts`. A non-`CAPTIONS_VALID` status keeps a video out of search sync (`src/modules/captions-search/elastic-captions-sync.repository.ts`).
- The validator only sees `Caption[]` (offsets are already resolved), which is why detection may belong in the extractor.
- The current branch (spec `.scratch/006-auto-caption-end-times/spec.md`, untracked) repairs the already stored block-level rows and adds a `caption_repair_followups` table that marks those stored block-level videos for refetching; this parked item is only about new scrapes. Related follow-ups listed in that spec's Out of Scope: finding why yt-dlp returned block-level tracks, and pinning the yt-dlp version in the Dockerfile.
