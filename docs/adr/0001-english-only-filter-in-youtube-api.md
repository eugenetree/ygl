# English-only caption filter lives in `YoutubeApiGetVideo`

The product only ingests English-language videos. When `findOrigTrack` detects
a non-`en` `*-orig` auto-caption track, `YoutubeApiGetVideo.getVideo()` returns
early with both caption tracks in `PRESENT_NOT_FETCHED` (or `ABSENT` when no
manual sibling exists), skipping the two ~12s yt-dlp caption downloads. The
detected `languageCode` is still recorded on the persisted video row for later
visibility.

## Considered alternatives

- **Filter in `ProcessVideoEntryUseCase`** — would still pay the caption
  download cost, since language is only known after `getVideo()` runs the
  metadata fetch. Rejected.
- **Two-phase API (`getVideoMetadata` + `getVideoCaptions`)** — cleaner
  separation, but a larger reshape of the API surface for a single policy.
  Deferred; the current module already encodes the analogous "no `*-orig` →
  don't fetch manual captions" policy, so adding "non-English → don't fetch"
  fits beside it.

## Scope

Only the `*-orig`-detected path is filtered. Videos with no `*-orig` (where
language is unknown from caption keys) keep the existing behaviour, even if
`yt-dlp`'s own `language` field suggests non-English. Revisit if non-English
transcription jobs become a measurable problem.
