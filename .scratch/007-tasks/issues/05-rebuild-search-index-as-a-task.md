# 05 — Rebuild search index as a task

**What to build:** `/rebuild_search_index` queues a rebuild, and the search sync
does it between incremental passes, so only one process ever writes the search
index.

- **No downtime:** search keeps answering throughout, including at the moment
  the new index takes over, even the first time.
- **Flat memory:** memory use doesn't grow with the number of captions, so about
  8.2M captions can't run the search sync out of memory.
- **Safe failure:** a failed rebuild leaves the live index untouched.

While it runs, `/tasks` shows the documents in the new index against the live
index's count. When it ends, the operator gets the duration, the captions
indexed, and the old and new index sizes. See spec `.scratch/007-tasks/spec.md`,
"Rebuild search index".

**Blocked by:** 02 — Messages when a run ends; 03 — `/tasks`

**Status:** resolved

- [ ] Checked once by hand against a local Elasticsearch, before relying on it:
      searches never fail through a switch-over. Later rebuilds swap the
      alias, then delete the old index after a grace period. The first one
      deletes the index named `captions` in the alias request that adds the
      alias, and searches retry once on the errors that causes.
- [ ] Only the manual captions of searchable videos are indexed, so captions of
      videos that are no longer searchable are gone after the rebuild.
- [ ] The rebuild goes through searchable videos in id order and loads each
      video's captions through the captions' video id index. It adds no index
      to the captions table.
- [ ] It writes into a new dated index with the existing settings and mappings,
      in bulk batches sized for a 512 MB heap.
- [ ] At the end, one atomic alias request points `captions` at the new index,
      and the old one is deleted after a short grace period.
- [ ] At start, it deletes any half-built index left by an earlier failed
      rebuild.
- [ ] It records a successful sync whose watermark is the newest caption at the
      rebuild's start, so the next incremental pass picks up captions created
      during the rebuild.
- [ ] No incremental pass runs during a rebuild. Searches and the incremental
      pass keep addressing the index as `captions`.
- [ ] `/rebuild_search_index` replies with the run id, or "already running".
- [ ] `/resync_captions` and the old resync use case are removed.
- [ ] Tests against the real test database with a fake Elasticsearch client
      cover:
      - [ ] which captions are indexed;
      - [ ] the alias swap and the old index's deletion;
      - [ ] removing a leftover index;
      - [ ] the recorded watermark.
- [ ] The completion message's formatting has unit tests.

## Comments

**Hand check against a local Elasticsearch (2026-10-25)**

- Deleting the old index inside the alias request failed the searches running
  on it: 6–9 failed searches per run. Swapping the alias, then deleting the old
  index after a short grace period: 0 failed searches in 5 runs.
- The first switch-over can't be done that way: an alias can't be added while
  an index of the same name exists, so `remove_index` stays in the request.
  Searches in flight then fail with index-not-found or
  `no_shard_available_action_exception`, and searches retry once on those.
