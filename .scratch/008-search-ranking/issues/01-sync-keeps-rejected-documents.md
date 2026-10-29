# 01 — The incremental sync stops losing rejected documents

**What to build:** when Elasticsearch rejects a document the incremental sync
sends, the pass fails instead of carrying on, so the captions are retried a
minute later rather than missing from search until the next rebuild. A
temporary rejection (a 429 on the small prod heap) heals by itself. A
permanent one stalls the sync loudly in the `sync-elastic` logs, naming the
rejected document and the reason.

The sync writes through the same index-writing path the rebuild already uses,
which fails on any rejected document, and its own index creation goes away:
only the rebuild creates indices. An environment where no search index exists
yet is out of scope.

This is a prefactor: it works against today's mapping and changes nothing
about what is written. See spec `.scratch/008-search-ranking/spec.md`,
"Incremental sync".

**Blocked by:** None — can start immediately

**Status:** resolved

- [ ] A pass whose bulk write has a rejected document records `FAIL` with the
      rejection in its fail reason, and the watermark stays at the last
      successful pass.
- [ ] The next pass picks up the same captions again; rewriting them is keyed
      by caption id, so nothing is duplicated.
- [ ] A pass with no rejection writes the captions newer than the watermark
      and moves the watermark to the newest one, as today.
- [ ] The sync no longer creates the search index itself.
- [ ] Covered by a new DB test of the incremental sync use case against the
      real test database and the fake Elasticsearch client, in the style of the
      rebuild use case's DB test (the fake can fail writes).
