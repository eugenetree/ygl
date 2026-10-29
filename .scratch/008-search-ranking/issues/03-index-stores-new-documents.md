# 03 — The search index stores documents of the new shape

**What to build:** the next index the rebuild creates has a strict mapping
holding exactly the document from 02, and both writers — the rebuild and the
incremental sync — send that document, with the video's channel id.

The mapping (spec `.scratch/008-search-ranking/spec.md`, "Search index
document"): `dynamic: strict`, one shard, no replicas; `id`, `videoId`,
`channelId` as keyword; `startTime`, `endTime` as long; `text` as text with the
standard analyzer and `norms: false`; `wordCount` as short; `startsSentence`,
`endsSentence` as boolean. The dead snake_case fields, the unused analyzer,
`text.keyword`, `type`, `duration`, `createdAt`, `updatedAt` and
`channelSearchScore` are gone.

Both repository reads that feed the writers select the video's channel id and
stop selecting the channel's search score.

Search keeps the current query in this ticket. It still works on an index with
the new mapping, since `text` is there.

**Blocked by:** 01 — The incremental sync stops losing rejected documents;
02 — Caption features and the search index document

**Status:** ready-for-agent

- [ ] A dated index created by the rebuild has the new mapping.
- [ ] The rebuild writes, for each manual caption of a searchable video, the
      document function's output with that video's channel id (extend the
      rebuild use case's DB test).
- [ ] The incremental sync writes the same document for each new caption
      (extend 01's DB test).
- [ ] Nothing selects the channel's search score for indexing any more.
