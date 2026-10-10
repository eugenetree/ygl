# Spec: Decide the video language from the original audio, not the first `-orig` caption track

Status: ready-for-agent

Related: `docs/adr/0001-english-only-filter-in-youtube-api.md` (its Scope section changes)

## Problem Statement

English videos are being recorded as non-English, so their captions are never
downloaded and they never reach search. The channels they belong to are also
counted as non-English and lose scraping priority.

The cause is how the scraper decides a video's **video language**. It takes the
first `-orig` auto-caption track that yt-dlp lists. An `-orig` track is YouTube's
speech recognition of *some* audio track, not necessarily the **original
audio**. On videos with **dubs**, YouTube often runs speech recognition on one
or more dubs:

- `XqS7kIWMIDE` (Dan Koe, English) has 21 audio tracks and 21 `-orig` tracks.
  `ar-orig` comes first, so it would be recorded as Arabic.
- `fQS05oFiU9A` is French with an English dub. `en-US-orig` comes first, so it
  is recorded as English, the reverse mistake.
- Across 328 prod videos where yt-dlp said English but we stored another
  language, 12 had several `-orig` tracks with the right one not first. 316 had
  a single `-orig` track in another language, while YouTube marked the original
  audio as `en-US`.

yt-dlp's top-level `language` is not a fix on its own. It is the language of
whichever format yt-dlp would download. Without ffmpeg that is often format
`18`, which carries the `-orig` language. It drifted from the original audio on
53 of the 328 between two fetches.

YouTube does say which audio track is original, and yt-dlp exposes that as
`language_preference = 10` on the original track's audio formats. In every
dubbed video checked, the mark was present and stable.

## Solution

The scraper decides the video language from the original audio when YouTube
marks one, and only falls back to the `-orig` tracks when it doesn't. It
downloads the auto-captions from the `-orig` track that matches the video
language, not the first one listed.

When the yt-dlp response contradicts our expectations (conflicting marks, dubs
with no mark, or several `-orig` tracks with no mark), the scraper stops with a
dedicated error and a Telegram notification, so the video can be analysed
before any rule is guessed for it.

The raw value of the original audio mark (`en-US`) is stored on the video, so
later questions ("how many videos marked English had no `en-orig`?") can be
answered from the database without fetching from YouTube again.

## User Stories

1. As a learner searching for an English phrase, I want English videos that
   YouTube auto-dubbed into other languages to be searchable, so that results
   include channels like Khan Academy and Great Big Story.
2. As a learner, I want a clip's captions to match the audio that plays, so that
   I never get English captions over a French original.
3. As the scraper operator, I want a dubbed video's video language to come from
   its original audio, so that the first `-orig` track in yt-dlp's list no
   longer decides it.
4. As the scraper operator, I want the auto-captions downloaded for an English
   video to be the `-orig` track matching the original audio, so that the
   caption comparison runs on YouTube's transcript of what was actually said.
5. As the scraper operator, I want a video whose original audio is marked
   English but which has no English `-orig` track to be recorded as English
   with auto-captions absent, so that it is labelled truthfully and skipped
   without downloads.
6. As the scraper operator, I want a video whose original audio is marked
   non-English to be recorded in that language, even when it also has an
   English `-orig` track from a dub, so that the English-only filter skips it.
7. As the scraper operator, I want undubbed videos (no mark) with exactly one
   `-orig` track to keep today's behaviour, so that the fix changes nothing for
   most of the catalogue.
8. As the scraper operator, I want videos with no mark and no `-orig` track to
   keep a null video language, so that the ~20k videos without speech captions
   are untouched.
9. As the scraper operator, I want the scraper to stop and notify me when a
   video's audio is marked original in more than one language, so that I can
   look at a case we have never seen before any rule is guessed for it.
10. As the scraper operator, I want the scraper to stop and notify me when a
    video has audio in several languages but none marked original, so that my
    expectation "no mark means no dubs" is checked, not assumed.
11. As the scraper operator, I want the scraper to stop and notify me when a
    video has no mark but several `-orig` tracks, so that an ambiguous video is
    never labelled by list order again.
12. As the scraper operator, I want the stop notification to include the video
    ID, the marked languages, the audio languages and the `-orig` keys, so that
    I can analyse it from Telegram without re-fetching.
13. As the scraper operator, I want the video language stored as a base code
    (`en`, `zh`, `yue`), so that counts don't split across `nl` and `nl-nl` and
    the English check stays a plain comparison with `en`.
14. As the scraper operator, I want the raw original-audio language (`en-US`,
    `fr-FR`) stored in its own column, so that I keep the full value YouTube
    gave and can audit how the mark drove each decision.
15. As the scraper operator, I want the stored original-audio language to be
    null when no track is marked, so that its presence tells me which rule
    decided the video language.
16. As the scraper operator, I want yt-dlp's top-level `language` to keep being
    stored as before, so that the history that exposed this bug stays
    comparable.
17. As the scraper operator, I want a video language outside our supported list
    to be stored as null, as today, so that unknown codes never reach the
    database.
18. As the scraper operator, I want `-orig` tracks in unsupported languages
    still counted when deciding whether a video has several `-orig` tracks, so
    that an unsupported first track can't hide an ambiguity.
19. As the scraper operator, I want an audio-description track (`en-desc`) to
    count as its base language, so that an English video with audio
    description is not mistaken for a dubbed one.
20. As the scraper operator, I want channel priority to stop counting English
    dubbed videos as non-English for newly scraped videos, so that channels
    like Khan Academy aren't pushed down the queue.
21. As a future developer, I want the decision and its rejected alternatives
    (top-level `language`, the "default" audio track, ffmpeg, backfill)
    recorded in an ADR, so that nobody re-proposes them without the evidence.
22. As a future developer, I want ADR-0001's scope to describe the new rule, so
    that it no longer claims yt-dlp's language is ignored for videos without an
    `-orig` track.

## Implementation Decisions

### Inputs read from the yt-dlp response

| What | How |
|---|---|
| audio streams | `formats` entries whose `acodec` is not `"none"` |
| base code | lowercased, the part before the first `-`: `en-US` → `en`, `en-desc` → `en`, `nl-NL-orig` → `nl` |
| mark languages | distinct base codes of audio streams with `language_preference === 10` |
| audio languages | distinct base codes of audio streams whose `language` isn't null |
| `-orig` keys | `automatic_captions` keys ending in `-orig` with non-empty formats, **all of them**, including unsupported languages |

Not used in the decision: the top-level `language`, `language_preference = 5`
("default", which depends on the viewer), and `language` on streams without the
mark.

### Rules (top to bottom, first match wins)

| # | Condition | Outcome |
|---|---|---|
| 1 | mark on several languages | error |
| 2 | mark on one language | video language = the mark's base code. Auto-captions = the `-orig` key with the same base code; if none, auto-captions are absent |
| 3 | no mark, several audio languages | error |
| 4 | no mark, several `-orig` keys | error |
| 5 | no mark, exactly one `-orig` key | video language = that key's base code; auto-captions = that key |
| 6 | no mark, no `-orig` key | video language = null |

If the resulting language fails the supported-language check, the video
language is null (as today).

Several marked languages are possible in principle: yt-dlp gives `10` to every
stream whose YouTube track name contains "original", whatever its language. It
was never seen in the checked videos.

### Captions (same logic as today, keyed on the decided video language)

| Video language | Auto-captions | Download? |
|---|---|---|
| null | absent | no |
| non-English | present-not-fetched if a matching `-orig` key exists, else absent | no |
| English, no matching `-orig` key | absent | no |
| English, matching `-orig` key, no manual | present-not-fetched | no |
| English, matching `-orig` key and manual | fetched | yes, both |

Manual-caption state keeps today's logic: the subtitle key matching the video
language, exact match first, then prefix match. The auto-caption download uses
the chosen `-orig` key exactly as yt-dlp lists it (e.g. `en-orig`,
`en-US-orig`).

### Modules and interfaces

- **yt-dlp response schema:** add `formats` as an optional array of objects
  with optional, nullable `acodec`, `language` and `language_preference`. Other
  format fields are ignored. Parsing stays lenient, so a response without
  `formats` is valid (no mark, no audio languages).
- **`YoutubeApiGetVideo`:** replace the first-`-orig` lookup with the rules
  above. `getVideo()`'s result gains `originalAudioLanguage: string | null`, and
  its error union gains the new error type.
- **New error type `AMBIGUOUS_VIDEO_LANGUAGE`:** carries the video ID, mark
  languages, audio languages and `-orig` keys. It is deliberately *not* a skip
  cause. The video worker's existing handling of unknown errors applies: the
  video is marked failed, the orchestrator stops the scraper, and Telegram gets
  the error type and details.
- **Video domain type, props and DB row:** gain `originalAudioLanguage` (raw,
  nullable string). The video mapper passes it through like
  `languageCodeYtdlp`.

### Schema

- Migration adds a nullable `varchar` column `originalAudioLanguage` to
  `videos` (snake_case `original_audio_language` in Postgres, via the existing
  casing plugin). Existing rows stay null. No data migration.
- `language_code` keeps its type. New rows get base codes only. The 13
  existing regional values (`nl-nl` and the like) are left alone.
- `language_code_ytdlp` is unchanged and still stores the top-level `language`.

### Docs

- **New ADR:** decide the video language from the original audio mark, with
  the single `-orig` track as fallback. Record why the top-level `language`,
  `language_preference = 5`, ffmpeg and a backfill were rejected, and the
  accepted risk that an uploader's wrong mark is believed.
- **ADR-0001:** update its Scope section. A video with a marked non-English
  original audio is now recorded as non-English even without an `-orig` track.
- **`CONTEXT.md`:** already defines **Spoken language**, **Video language**,
  **Original audio** and **Dub**. Commit those with this change.

## Testing Decisions

- **One seam:** `YoutubeApiGetVideo.getVideo()` with the existing fake yt-dlp
  client, which takes a yt-dlp JSON response and records which caption keys
  were downloaded. Tests assert only on what callers see: the returned video
  language, original-audio language, caption states, which `-orig` and manual
  keys were downloaded, and the error with its details. They don't assert on
  private helpers.
- **Cases modelled on real videos from the investigation:**
  - `XqS7kIWMIDE`: 21 `-orig` keys with `ar-orig` first, original `en-US` →
    `en`, downloads `en-orig`, original-audio language `en-US`.
  - `6HhCcuD0coI`: `ja-orig` only, original `en-US` → `en`, auto-captions
    absent, no download.
  - `fQS05oFiU9A`: `en-US-orig` then `fr-orig`, original `fr-FR` → `fr`,
    auto-captions present-not-fetched, no download.
  - `1JXqubOoNL8`: `en-orig` only, original marked `hi` → `hi`, auto-captions
    absent (accepted risk: the mark is wrong).
  - `Ypqr9SpQ35c`: `bg-orig` only, no mark → `bg` (YouTube trusted, even though
    wrong).
  - `_0G4OG39XjI`: `en-orig` only, no mark → `en`, downloads `en-orig`,
    original-audio language null.
- **Constructed cases:**
  - each of the three error rules, asserting the error type and all its
    details;
  - an English video with an `en-desc` audio-description track and no mark
    (not an error);
  - a mark whose language is unsupported (video language null);
  - an unsupported `-orig` key first among several with no mark (error, not a
    silent pick);
  - a regional mark (`en-US`) matched to a plain `en-orig` key, and a regional
    key (`nl-NL-orig`) stored as `nl`;
  - a response without `formats` (behaves as today).
- **Existing tests stay green.** The current language-key and caption-state
  tests describe undubbed videos, which rules 5 and 6 keep unchanged. The
  "ignoring yt-dlp language field" test still holds, since the top-level
  `language` stays out of the decision.
- **Prior art:** the existing describe blocks in the `YoutubeApiGetVideo` test
  file ("language key selection", "caption track states", "language
  detection"), which build responses from a minimal base and assert on
  captured sub-langs.
- **Not tested separately:** saving the new column (the compiler requires the
  mapper to pass it through, and every database test runs the migrations), and
  the worker stopping on the new error (already covered for unknown errors).

## Out of Scope

- **Backfill.** Existing videos keep their stored language. Nothing in the
  database identifies dubbed videos, re-fetching about 3k non-English videos
  costs scraper time and bot-check risk, and the 328 check showed only 12 would
  gain captions.
- **ffmpeg.** Adding it would change yt-dlp's default format choice, but the
  rule doesn't use the top-level `language`, so it isn't needed.
- **The ~20k videos with no speech captions** (no `-orig` track). Some are
  dubbed and will get a video language from the mark on their next scrape, but
  nothing is done for them specifically.
- **Videos YouTube transcribed in the wrong language with no mark** (TED-Ed as
  `nl`, `Ypqr9SpQ35c` as `bg`). The metadata can't tell, and without English
  auto-captions the caption comparison can't run anyway.
- **Using uploaded captions** to decide or rescue a video language.
- **Accent or region** (US / UK). The region on audio labels is chosen by the
  uploader and present on a minority of videos.
- **Normalising the 13 existing regional `language_code` values.**
- **Changing `language_code_ytdlp`**, or the Telegram last-videos view.

## Further Notes

- **Accepted risk:** when the uploader sets the wrong language, the mark is
  believed. `_OtiyYrgvE0` (a Japanese song, mark `en-US`, `ja-orig`) and
  `2T55XJNsKo8` (French, single track labelled `en-US original`, `fr-orig`)
  will be recorded as English with auto-captions absent. The data can't tell
  these apart from the Khan Academy and Great Big Story cases, where speech
  recognition is what's wrong.
- **Evidence behind "no mark means no dubs":** every checked video with more
  than one audio language had a mark (319 in the 328, all in two further
  50-video samples). No single-track video had several `-orig` keys (0 of 83).
  Rules 3 and 4 turn those observations into checks.
- **Why the top-level `language` drifted:** format `18` (the single 360p file)
  has no audio-track label, so yt-dlp gives it the `-orig` language. Without
  ffmpeg, yt-dlp's default selection picks it. All 53 drifted videos had format
  `18`, and none of the other 275 did.
- The April switch to `-orig` detection was right for its case (yt-dlp said
  English while only Hindi auto-captions existed). This change keeps that
  outcome: such a video still has no usable English auto-captions.
