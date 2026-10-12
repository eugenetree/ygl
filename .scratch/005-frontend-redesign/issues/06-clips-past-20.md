# 06 — Clips past the first 20

**What to build:** A listener can go beyond the first 20 clips:
- stepping past the last loaded clip with Next loads the next 20 and keeps
  going;
- "Show more clips" at the end of the list does the same.

The count line follows along ("First 40 of 332 clips", then "All 52 clips"). A
batch that fails to load doesn't end the results.

**Blocked by:** 03 — Play clips

**Status:** resolved

- [ ] Later batches of 20 come from `/api/search` by offset, fetched in the browser on top of the server's first batch.
- [ ] Clips are deduplicated by caption id across batches.
- [ ] When Next reaches the last loaded clip and more exist, the next batch loads and playback continues into it.
- [ ] "Show more clips" at the end of the list loads the next batch. There is no infinite scroll.
- [ ] The count line reads:
  - "First {loaded} of {total} clips", with `10,000+` when the total isn't exact;
  - "All {n} clips" once everything has loaded.
- [ ] Next is disabled on the last clip only when no more batches exist. Paging stops at the API's limit of 10,000 clips.
- [ ] A failed batch keeps the listener on the current clip and shows a toast. Pressing Next or "Show more clips" again retries.
