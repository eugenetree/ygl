# Spec: Store correct end times for auto captions, and repair the ones already stored

Status: ready-for-agent

## Problem Statement

The similarity score that decides which videos are searchable is inflated, so
search shows clips from videos whose manual captions don't really match what is
spoken.

The cause is the end time we store for auto captions. YouTube's auto-caption
track (json3) groups words into on-screen lines: each line has a start and a
display duration, and each word only an offset from the line's start. Words
have no end time, so the extractor makes one up: a word ends where the next
word of its line starts. For the **last word of every line** the fallback adds
the line's start twice, so the word "ends" at `2 × line start + duration`. A
word at minute 35 seems to last 35 minutes.

- About 13.5M of 85.8M stored auto captions (15.8%) are affected, in every
  video that has auto captions.
- The similarity score treats each auto caption's start–end as the window in
  which a manual caption word counts as matched. Stretched windows give credit
  for matches that aren't there.
- With correct end times, about 1,620 of the 44,098 searchable videos (3.7%)
  fall below the 0.9 threshold and 14 rise above it. Measured on a full local
  copy of prod.

The same bug also fires on the **first** word of a line when YouTube places the
second word at offset 0: YouTube leaves `tOffsetMs` out for a zero offset, and
the extractor reads the missing offset as "no next word".

Fixing the extractor only helps videos scraped from then on. `/reprocess_captions`
recomputes scores from the auto captions already stored, so without repairing
those it would recompute the same inflated scores.

## Solution

1. The extractor stores end times that follow speech: a word ends when the next
   word is spoken, and the last word of a line ends when the next line starts,
   never later than its own line leaves the screen.
2. A one-off database migration repairs the auto captions already stored, from
   the stored data alone, without fetching anything from YouTube. On the videos
   checked against fresh YouTube data, the repaired captions match what the
   fixed extractor would store for 99.98% of auto captions, and no caption gets
   worse.
3. After the deploy, the operator recomputes similarity scores, channel
   priorities and the search index with the existing bot commands.

The search threshold stays at 0.9.

## User Stories

1. As a learner, I want search to show clips only from videos whose manual
   captions match the audio, so that the phrase I search for is actually spoken
   in the clip.
2. As a learner, I want videos that only passed the similarity check because of
   the bug to leave search, so that I stop landing on clips where the captions
   drift from the speech.
3. As a learner, I want the few videos that were wrongly kept out of search to
   join it, so that I don't miss good clips.
4. As the scraper operator, I want newly scraped videos to get correct auto
   caption end times, so that their similarity scores are right from the start.
5. As the scraper operator, I want the last word of each line to end when the
   next line starts, so that its match window follows speech instead of the
   seconds the line lingers on screen.
6. As the scraper operator, I want the last word of a line followed by a pause
   to end when its line leaves the screen, so that its window doesn't stretch
   across the silence.
7. As the scraper operator, I want the last word of the video's last line to end
   when that line leaves the screen, so that it still gets a sensible end.
8. As the scraper operator, I want a word YouTube places at offset 0 (offset
   omitted) to be read as starting with its line, and the word before it to end
   where the next word with a later start begins, so that it is neither mistaken
   for a line's last word nor given zero length.
9. As the scraper operator, I want a last word that starts after the next line
   has already begun to end at its own line's end, so that it never ends before
   it starts.
10. As the scraper operator, I want a last word that YouTube places after its
    own line's end to end when the next line starts, or to get zero length when
    there is no later line, so that no stored caption ever ends before it starts.
11. As the scraper operator, I want manual captions to be extracted exactly as
    today, so that the fix can't affect search clip timings.
12. As the scraper operator, I want the auto captions already stored to be
    repaired once during the deploy, so that I don't have to refetch 56,000
    videos from YouTube.
13. As the scraper operator, I want the repair to change only the end time and
    duration of auto captions, so that text, start times and manual captions
    stay as they are.
14. As the scraper operator, I want the repair to leave captions that were
    stored correctly untouched, so that it can only make the data better.
15. As the scraper operator, I want the repair to fix the last words of lines
    even where YouTube's lines overlap and repeat words with identical times, so
    that no 35-minute caption survives in those videos.
16. As the scraper operator, I want the repair to read each video's auto
    captions in time order, so that the result doesn't depend on where Postgres
    happens to store the rows.
17. As the scraper operator, I want the repair to run exactly once and only on
    captions saved by the buggy extractor, so that nobody has to remember a
    manual step and no correct caption gets "repaired" twice.
18. As the scraper operator, I want the scraper to stay stopped until the repair
    finishes, so that no caption from the fixed extractor exists when the
    repair runs.
19. As the scraper operator, I accept about 10–30 minutes of downtime for the
    site, API, bot and scraper during the deploy, so that the repair is a plain
    migration.
20. As the scraper operator, I want an index on the captions' video id in the
    same deploy, so that `/reprocess_captions` can load each video's captions
    without scanning the whole table.
21. As the scraper operator, I want the captions processing algorithm version
    bumped, so that every reprocessed video records that its score comes from
    corrected captions.
22. As the scraper operator, I want to run `/reprocess_captions` after the deploy
    and get scores, shifts and statuses recomputed from the repaired captions,
    so that searchability reflects the fix.
23. As the scraper operator, I want to run `/recalculate_priority` after
    reprocessing, so that channel scraping priorities use the corrected average
    similarity.
24. As the scraper operator, I want to run `/resync_captions` after that, so
    that videos that are no longer searchable leave the search index and newly
    searchable ones enter it.
25. As the scraper operator, I want the auto and manual captions statuses to
    come out of reprocessing unchanged, so that only the similarity score and
    shift move.
26. As the scraper operator, I want the block-level auto captions saved between
    2026-10-02 and 2026-10-07 to be repaired by the same rule, each segment of a
    block ending when the next block starts and never after its own block
    leaves the screen, so that their scores stop being inflated even before
    they are refetched.
27. As the scraper operator, I want the block-level videos recorded in a table
    during the deploy, so that a follow-up can refetch exactly those. Videos
    with overlaps stay listable by query (repeated start times, saved before
    the deploy).
28. As a developer, I want the extractor's line rules covered by tests built
    from real YouTube json3 snippets, so that each edge case found in real data
    stays handled.
29. As a developer, I want the repair tested against a real Postgres database by
    storing what the buggy extractor produced and comparing the repaired
    captions with what the fixed extractor produces from the same json3, so that
    the two rules can't drift apart.
30. As a developer, I want a short comment where the extractor and the repair
    deal with YouTube's lines, so that a reader understands why a word's end
    depends on the next line and on leading spaces.

## Implementation Decisions

### Extractor (YouTube module, auto captions only)

- The extractor parses all events up front and keeps only valid text lines
  (events with words). Line-break events (`"\n"`) and invalid events are
  dropped as today. This lets each line know the next text line.
- A word's start is the line's start plus its offset. A missing offset means 0,
  for any word, not only the first: YouTube omits `tOffsetMs` whenever it is 0.
- A word ends where the next word of the same line with a later offset starts.
  Words sharing an offset say nothing about each other's end: `IL` and ` when`
  both at offset 0 end where ` it` (301) starts. Block-level tracks give no
  offsets at all, so every segment of a block ends like its last one.
- A word with no later word in its line (the last word of a line), with
  `lineEnd = line start + duration` and `next = start of the next text line`:
  - if `next` exists and is after the word's start: `min(next, lineEnd)`;
  - otherwise: `lineEnd`;
  - if that result is still before the word's start (YouTube placed the word
    after its line's end): `next` if it exists and is after the word's start,
    otherwise the word's start (zero length).
- Manual caption extraction does not change.
- The extractor's interface (`extractFromJson({ jsonResponse, type })` returning
  captions with start, end, duration and text) does not change.

### Repair migration

- Three migrations, in this order:
  1. an index on the captions' video id;
  2. a `caption_repair_followups (video_id, reason, created_at)` table, filled
     with every video that has an auto caption with a line break inside its
     text, as `reason = 'block_level'`. Only block-level tracks have such rows:
     2,088 videos, all saved 2026-10-02 to 10-07. The follow-up deletes a row
     once its video is refetched;
  3. the repair, as one SQL `UPDATE`.

  They are separate so the repair can be run in a test database whose template
  already has the index.
- The repair only touches auto captions, and only `end_time` and `duration`
  (`duration = end − start`). It reads YouTube's leading space, which the
  extractor stores as part of the text: the first word of a line doesn't start
  with a space, every other word does. Measured on 50,000 videos without
  overlaps, this marks line starts correctly for 99.995% of rows, in every
  language present (no Chinese or Japanese in the data).
  - **A line start** is a row whose text doesn't begin with a space character
    (U+0020), plus the video's first row in any case. The space check is literal,
    not "any whitespace": 20,395 block-level rows begin with `\n` and are line
    starts. 153 videos have a first row that begins with a space (e.g. `" 155"`
    in `-AU27sMNNN0`), so their first line's start would otherwise be missing.
- Rows of a video are processed in start-time order, ties broken by physical
  row order, which is the order the validation used. For each auto caption:
  1. **Inner word:** its stored end equals the next row's start → unchanged.
  2. **Possible last word:** look at the most recent 4 line starts up to this
     row, nearest first, and take the first one
     for which `stored end − line start ≥ this row's start`. That difference is
     the real line end, with the duplicated line start removed. Then, first
     match:
     - the next row has the same start and isn't a line start (a second word
       at offset 0, or any segment of a block), or has the same start and the
       same stored end (a block segment that begins with `\n`, 20,225 rows):
       `new end = min(next later start, line end)`, where the next later start
       is the start of the first following row that starts after this one;
     - the next row starts after this row: `new end = min(next row start, line end)`;
     - otherwise (no next row, or the next row is a line start with the same
       start): `new end = line end`.
  3. **No candidate fits:** it was an inner word that only looked like a last
     word, because a repeated copy from an overlapping line sorts between it and
     its next word. Unchanged.
- **Why the 4-line-start limit:** every real broken last word on the 3,496
  videos with overlaps found its line start within the 3 nearest. Without a
  limit, about 2,235 correct captions would reach back to the first second of
  the video, find a "fitting" line start there and be corrupted.
- **Why not the earlier chain-based rule** (line start = first row after the
  last break in the "end equals next start" chain): on overlapping lines the
  chain breaks on every repeated word, so it guesses the wrong line start and
  leaves 166 broken captions of 35-minute length.
- The repair runs inside the deploy's `migrate` step, once (Kysely tracks it).
  The bot, API, scraper and search sync wait for `migrate`, so no caption from
  the fixed extractor exists yet. Expected 10–30 minutes on prod, measured
  2m24s for the read-only version on a local copy.
- Block-level auto captions (2026-10-02 to 10-07) go through the same rule.
  Their segments had no offsets, so the old extractor stored every segment of a
  block with the block's start and the same broken end, and most segments begin
  with a space. In `4FRvd460mQc` the block at 6660 is 8 rows, all ending at
  19320 (`2 × 6660 + 6000`); each now ends at 10740, the next block's start.
  The word timings inside a block are lost; refetching restores them.
- **Dry run before merging.** A read-only version of the repair query is run
  over the full local copy of prod. It must show:
  - no auto caption ending before it starts;
  - no auto caption longer than 60 s, other than lines YouTube itself shows that
    long (`[Music]` and the like);
  - about 13.5M rows changed;
  - for videos without overlaps, the same result as the chain-based rule. That
    rule is exact there, and the check covers the 514 line starts recorded with
    a leading space;
  - for block-level videos, every changed row ends at or before the next
    block's start.

  The dry run's timing also gives the downtime estimate for prod.

### Reprocessing

- `CAPTIONS_PROCESSING_ALGORITHM_VERSION` is bumped.
- The order after the deploy is `/reprocess_captions`, then
  `/recalculate_priority`, then `/resync_captions`. The scheduler and the search
  sync don't notice updated videos on their own: they only look at newly
  created rows.
- `/resync_captions` rebuilds the index from empty, so search is partial while
  it runs.

### Glossary

`CONTEXT.md` already has the outcomes of this work: a **Caption** is a whole
line for manual captions and a single word for auto captions; **Similarity
score** and **Searchable** are defined. YouTube's grouping of auto words into
lines stays out of the glossary. It is YouTube's format, it isn't stored, and
only the extractor and the repair deal with it.

### Validation already done

Before implementation, against a full local copy of prod and fresh yt-dlp
downloads:

- **No overlaps:** 41 videos in en, fa, et, ar, es, fr, de, ko and it. The
  repaired captions equal the fixed extractor's output for 100% of auto
  captions.
- **With overlaps:** 65 videos, 241,910 auto captions. 99.98% are equal. 0 get
  worse than stored, 37,913 get better. 3 differ by more than 2 s, all words
  YouTube gives identical starts within one line, whose stored order is lost.
- **Whole database (overlap videos):** after the repair, no auto caption is
  longer than 60 s except `[Music]`-type lines that YouTube itself shows for
  that long.

## Testing Decisions

- Tests check external behaviour only: the captions the extractor returns for a
  json3 input, and the rows in the `captions` table after the repair migration
  runs. Never helper internals.
- **Extractor seam: `extractFromJson`.** Inputs are small json3 documents
  trimmed from real YouTube responses, one per rule:
  - normal next line (` weight` / `but`, `EtUkyVrIMdQ`);
  - pause longer than the line (`about this.` / `This good.`, `zF2QwHnk3EE`);
  - last line of the video;
  - second word without `tOffsetMs` (`IL` / ` when`, `5ulGRph203M`);
  - block without offsets (`Trump's` / ` arraignment`, `4FRvd460mQc`);
  - overlapping lines repeating words (`so we were fortunate to get uh funding`
    / `fortunate to get uh funding about half a`, `j0oTxaatnbE`);
  - next line starting after the last word starts;
  - last word after its own line's end (`of`, `nW_tYC_MffY`);
  - `"\n"` events in between.

  Prior art for building json3 inputs: the minimal json3 in the YouTube module's
  get-video tests and the raw fixtures under the captions fixtures folder.
- **Repair seam: the repair migration's `up()` on a real Postgres test database**
  (`useTestDatabase`, as in the existing `*.db.test.ts` files, ADR-0002). Each
  case:
  1. inserts the auto captions the buggy extractor would have stored for a
     json3 document, using the old formula in a test helper;
  2. runs the migration;
  3. expects the rows to equal what the fixed extractor returns for the same
     json3.

  Also covered:
  - manual captions untouched;
  - rows inserted out of time order still repaired correctly;
  - a video whose first row begins with a space, and a block-level video with
    rows beginning with `\n`;
  - a block-level video whose blocks are several rows sharing a start;
  - the follow-up table marks only videos with block-level auto captions;
  - correctly stored captions (inner words, including ones that look like last
    words next to a repeated copy) unchanged;
  - two videos in one run don't affect each other.
- No test for the index migration or the deploy order. Those are covered by the
  migration runner and docker compose.

## Out of Scope

- **Refetching the videos whose repair may be imperfect:** the 2,088
  block-level videos in `caption_repair_followups`, and optionally the 3,496
  with overlaps (repeated start times, saved before the deploy; a rough net that
  also catches second words at offset 0). Separate follow-up, together with:
  - finding why yt-dlp returned block-level tracks on 2026-10-02 to 10-07. The
    raw yt-dlp responses on prod are kept 14 days, so the ones from those days
    are expiring now.
  - pinning the yt-dlp version in the Dockerfile, so a silent upgrade can't
    change the caption format again.
- **Rejecting block-level tracks at scrape time** with their own auto captions
  status: parked in `.scratch/parked/007-reject-block-level-auto-captions.md`.
- **Automating the follow-up of reprocessing:** `update()` setting
  `updated_at`, the priority scheduler and the search sync discovering changed
  videos by an `updated_at` watermark. Separate change.
- Revisiting the 0.9 threshold.
- Search clip timings, which come from manual captions and aren't affected.

## Further Notes

- The bug has been in the extractor since at least March 2026. The 0.9
  threshold (2026-04-22) was chosen while scores were inflated.
- Earlier analysis claimed YouTube never omits `tOffsetMs` for a non-first word.
  That was wrong: it omits it whenever the offset is 0, which is how the
  first-word variant of the bug arises.
- The first version of this spec assumed each stored block-level row was a
  whole block, and gave a second word at offset 0 zero length. The dry run
  found 189,917 block rows ending past the next block's start, which led to the
  "next later start" rule for both.
- Analysis scripts and per-video results from the investigation live in the
  sessions' scratchpads, not in the repo.
