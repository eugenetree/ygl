# 01 — Store each clip's video title and channel name in Elasticsearch

**What to build:** Search reads a clip's video title and channel name from the
caption documents in Elasticsearch, instead of looking them up in Postgres on
every request. Today `FindCaptionsUseCase` takes the captions Elasticsearch
found and asks `ClipVideoRepository` for their videos, so every search depends
on both stores, and search can't filter or rank by anything about the video or
its channel.

**When:** the first time search needs to filter or rank by a fact about the
video or its channel (the accent and speed chips on the results page are the
likely first), or sooner if depending on Postgres causes trouble.

**Blocked by:** None — can start immediately.

**Status:** needs-triage

- [ ] `getDataToSync` in `elastic-captions-sync.repository.ts` selects the video's title and the channel's name along with each caption, and the sync writes them into the caption document.
- [ ] The stored-caption schema in `CaptionsService` requires them, and `CaptionsService.search` returns full Clips.
- [ ] `FindCaptionsUseCase` goes back to passing results through, and `ClipVideoRepository` and its test are deleted.
- [ ] Every existing caption document is rewritten with the new fields before search starts requiring them, e.g. a full resync.
- [ ] Decide how a renamed video or channel reaches the documents: sync only adds captions created since the last run, so without a refresh the old title stays.
- [ ] The `/api/search` contract doesn't change.
