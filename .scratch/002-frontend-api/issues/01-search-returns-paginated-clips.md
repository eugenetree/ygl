# 01 — Search returns paginated Clips with a play-from point

**What to build:** A listener searching for a common phrase sees the real number
of matching clips instead of a hard ten, and every clip starts playing slightly
before the phrase. Today the search use case returns raw Elasticsearch hits with
no size, so Elasticsearch applies its default of ten, and the HTTP handler and
the Telegram find command each cast the stored document and subtract their own
lead-in.

After this ticket the captions-search core returns **Clips** (see `CONTEXT.md`)
with a **play-from point**, plus a total and whether that total is exact. It
takes an offset and a limit, and sorts by relevance then caption id so pages
never overlap. Both consumers read Clips and neither computes a lead-in.

This is a prefactor for ticket 02: the existing raw HTTP handler stays, and only
gains `offset` and `limit` pass-through. No Fastify yet.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [x] The search use case takes a query, an offset and a limit, and returns a Result of clips, total, and an exact-total flag; it no longer exposes Elasticsearch hits.
- [x] A Clip carries the caption id, video id, caption start and end in milliseconds, text, and the play-from point in milliseconds.
- [x] The play-from point is the caption start minus one second, never below zero.
- [x] Stored documents are validated with zod when mapped; a document that fails is skipped and logged as a warning.
- [x] Elasticsearch-only fields such as the channel search score do not appear on a Clip.
- [x] Elasticsearch is asked for exactly `limit` results from `offset`, sorted by score then caption id.
- [x] The total is tracked up to 10,000; beyond that it is reported as 10,000 and marked not exact.
- [x] An Elasticsearch failure returns a typed Failure rather than throwing.
- [x] The raw HTTP handler accepts `offset` and `limit` and returns clips, total and the exact flag.
- [x] The Telegram find command requests ten clips, builds its links from the play-from point, and its "showing 10 of N" header uses the real total.
- [x] The frontend starts playback at the play-from point and no longer subtracts its own second.
- [x] Pure unit tests cover the Clip mapping: the play-from clamp at zero, skipping invalid documents, dropping Elasticsearch-only fields, and the exact and not-exact total.

## Comments

- Tests run at `CaptionsService.search()` with an injected fake Elasticsearch
  client instead of a pure mapping function, so they also cover the request's
  `from`/`size`/`sort`/`track_total_hits` and the Failure path.
- Not verified against a live index: the `id` tiebreaker sort needs `id`
  mapped as `keyword` (as `createIndex` declares). An index created by
  dynamic mapping would have `id` as `text`, and every search would fail as
  SEARCH_UNAVAILABLE. Check `GET captions/_mapping` on the server.
