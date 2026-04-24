# Scraping Flow

## Overview

The pipeline runs as a sequential loop orchestrated by `ScraperOrchestrator`. Each iteration processes all four stages in order, then repeats from the beginning.

```
Loop:
  1. CHANNEL_DISCOVERY  →  discover channel IDs from search queries
  2. CHANNEL            →  enrich channel metadata
  3. VIDEO_DISCOVERY    →  discover video IDs for each channel
  4. VIDEO              →  enrich video metadata + fetch captions
  → repeat
```

The loop terminates when the channel discovery queue is exhausted, a worker errors, or a graceful stop is requested.

---

## Stage 1 — Channel Discovery

**Worker**: `search-channel-queries.worker.ts`  
**Input table**: `searchChannelQueries` (seeded from `words_dictionary.json` on first startup)  
**Output table**: `channelEntries` (channel ID + reference to source query)

Searches YouTube for channels matching each query keyword. Discovered channel IDs are written to `channelEntries` and a corresponding `channelJobs` row is created with `PENDING` status.

---

## Stage 2 — Channel Enrichment

**Worker**: `channel-entries.worker.ts`  
**Input table**: `channelEntries`  
**Output table**: `channels`

Calls the YouTube API to fetch full channel metadata for each discovered channel ID.

Data collected: name, description, avatar, subscriber/view/video counts, country code, keywords, creation date, `isArtist`, `isFamilySafe`.

After enrichment, a `videoDiscoveryJobs` row is created with `PENDING` status.

---

## Stage 3 — Video Discovery

**Worker**: `channels.worker.ts`  
**Input table**: `channels`  
**Output table**: `videoEntries` (video ID + channel reference)  
**Metadata table**: `channelVideosScrapeMetadata`

Lists all video IDs for each channel. Channels are filtered before processing:
- `videoCount < 10,000`
- `countryCode` in `[US, GB, CA, AU, NZ, IE]`
- No failed-video streak ≥ 5 (tracked in `channelVideosHealth`)

Each video ID is written to `videoEntries` and a `videoJobs` row is created with `PENDING` status.

---

## Stage 4 — Video Enrichment

**Worker**: `video-entries.worker.ts`  
**Input table**: `videoEntries`  
**Output tables**: `videos`, `captions`

Calls the YouTube API and yt-dlp to fetch full video metadata plus both auto-generated and manual caption tracks.

**Videos can be skipped** (status `SKIPPED` with a `skipCause`):
| Cause | Reason |
|---|---|
| `MEMBERS_ONLY` | Channel members-only content |
| `GEO_RESTRICTED` | Country-restricted |
| `AGE_RESTRICTED` | Age-gated |
| `PREMIERE` | Scheduled/live premiere |

Data collected: title, duration, view/like/comment counts, language codes, audio metadata (asr, abr, codec, channels), music metadata (track, artist, album), caption validity scores, upload date, description, and more.

**Caption analysis** (`CaptionAnalysisService`) validates each caption track and assigns a status:
- `CAPTIONS_VALID`, `CAPTIONS_ABSENT`, `CAPTIONS_EMPTY`, `CAPTIONS_TOO_SHORT`, `CAPTIONS_MOSTLY_UPPERCASE`, `CAPTIONS_HAS_OVERLAPPING_TIMESTAMPS`

If a video has manual-only captions, a `transcriptionJobs` row is created so auto captions can be generated separately for language detection.

---

## Job Status Lifecycle

All job tables share the same status flow:

```
PENDING → PROCESSING → SUCCEEDED
                     → FAILED
                     → SKIPPED  (video jobs only)
```

Workers use `SELECT ... FOR UPDATE SKIP LOCKED` within a transaction to safely dequeue jobs under concurrency.

---

## Triggering & Lifecycle

The scraper process is controlled via a PostgreSQL `LISTEN/NOTIFY` channel (`scraper_requested_status_changed`). Setting `scrapingProcess.requestedStatus` to `RUNNING` starts the orchestrator; `STOPPED` triggers graceful shutdown after the current item finishes.

**Startup**: seeds `searchChannelQueries` if empty, reconciles any crashed `RUNNING` state to `STOPPED`, then checks `requestedStatus`.

**Heartbeat**: periodic updates to `scrapingProcess.lastHeartbeatAt` while running.

---

## Key Files

| Layer | Path |
|---|---|
| Entry point | `src/main-scraper.ts` |
| Orchestrator | `src/modules/scraping/scraper.orchestrator.ts` |
| DB types | `src/db/types.ts` |
| Channel discovery worker | `src/modules/scraping/scrapers/channel-discovery/` |
| Channel enrichment worker | `src/modules/scraping/scrapers/channel/` |
| Video discovery worker | `src/modules/scraping/scrapers/video-discovery/` |
| Video enrichment worker | `src/modules/scraping/scrapers/video/` |
| Lifecycle (start/stop) | `src/modules/scraping/lifecycle/` |
