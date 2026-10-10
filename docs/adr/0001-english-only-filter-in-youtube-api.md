# English-only caption filter lives in `YoutubeApiGetVideo`

The product only ingests English-language videos. When the video language is
not `en`, `YoutubeApiGetVideo.getVideo()` returns early without downloading
captions, skipping the two ~12s yt-dlp caption downloads. Each caption track is
`PRESENT_NOT_FETCHED` when one exists in the video language, otherwise
`ABSENT`. The detected `languageCode` is still recorded on the persisted video
row for later visibility.

## Considered alternatives

- **Filter in `ProcessVideoEntryUseCase`** — would still pay the caption
  download cost, since language is only known after `getVideo()` runs the
  metadata fetch. Rejected.
- **Two-phase API (`getVideoMetadata` + `getVideoCaptions`)** — cleaner
  separation, but a larger reshape of the API surface for a single policy.
  Deferred; the current module already encodes the analogous "no video
  language → don't fetch manual captions" policy, so adding "non-English →
  don't fetch" fits beside it.

## Scope

The filter applies to whatever video language ADR-0009 decides: the original
audio's language when YouTube marks one, otherwise the single `*-orig` track's.
A video whose original audio is marked non-English is filtered even when it has
no `*-orig` track. Videos with no video language keep the existing behaviour,
and yt-dlp's top-level `language` field is never used. Revisit if non-English
transcription jobs become a measurable problem.
