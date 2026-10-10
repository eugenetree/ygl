# The video language comes from the original audio, then the single `-orig` track

`YoutubeApiGetVideo` decides a video's language from the audio track YouTube
marks as original (`language_preference = 10` on yt-dlp's audio formats). The
auto-captions it uses are the `-orig` track in that language. Without a mark,
it uses the single `-orig` track, as before. When the response breaks the
assumptions behind those two rules, it stops with `AMBIGUOUS_VIDEO_LANGUAGE`
instead of guessing. That happens when audio in several languages is marked
original, when there are dubs without a mark, or when there are several `-orig`
tracks without a mark. The language is stored as a base code (`en`). The mark's
raw value (`en-US`) is stored separately, in `originalAudioLanguage`.

## Why

An `-orig` track is YouTube's speech recognition of *some* audio track, not
necessarily the original. On auto-dubbed videos YouTube runs it on dubs.
Taking the first `-orig` track recorded English videos as Arabic, Vietnamese
or Japanese and dropped them. Of 328 prod videos where yt-dlp said English but
we stored another language, the mark was present on all of them and was
`en-US` on 326.

## Considered alternatives

- **yt-dlp's top-level `language`** — it is the language of the format yt-dlp
  would download. Without ffmpeg it often picks format `18`, which carries the
  `-orig` language. It drifted from the mark on 53 of the 328 between two
  fetches. It is still stored in `languageCodeYtdlp`, but the decision never
  reads it.
- **`language_preference = 5`** ("default" audio) — the default is the track
  YouTube plays for this viewer, which can follow the viewer's language or
  location.
- **Adding ffmpeg** to make the top-level `language` follow the original track
  — unnecessary once the mark is read directly.
- **Preferring an English `-orig` track** — wrong for non-English videos with an
  English dub, whose clips would play the original audio under English
  captions.
- **Backfilling stored videos** — nothing in the database identifies dubbed
  videos, so it means re-fetching thousands of videos to gain captions on a
  few.

## Consequences

- The mark is believed even when the uploader set it wrong (a Japanese song
  marked `en-US`). Such a video is recorded in the marked language with no
  matching auto-captions, and skipped.
- A video with no mark and one `-orig` track in the wrong language (YouTube
  transcribed English speech as Bulgarian) is still recorded in that language.
  Without auto-captions in the spoken language, the caption comparison couldn't
  run anyway.
