# 07 — Roll out: one deploy, then the rebuild

**What to build:** phase 1 live on prod, measured before and after. Done by the
operator by hand; an agent prepares the hand-over, it doesn't run it.

1. Run the eval script (04) against prod for the baseline, and paste the run
   into `docs/seo/ranking-eval.md` as "before phase 1" with the date.
2. Deploy everything (01–06) at once.
3. Run `/rebuild_search_index` right after, and wait for it to report the new
   index live (about 20 minutes on prod).
4. Check that the live index's document count matches the rebuild's report and
   that the live mapping is the new strict one.
5. Rerun the eval script and paste it as "after phase 1".

Expected during step 3, and accepted (spec `.scratch/008-search-ranking/spec.md`,
"Rollout"): search keeps answering but in near-random order apart from
exact-phrase hits first; clips show no captions before and after; phrase pages
rendered in that window stay cached for up to an hour, and the frontend cache
is not purged.

`docs/seo/ranking-eval.md` is never committed.

**Blocked by:** 03 — The search index stores documents of the new shape;
04 — Ranking eval script; 06 — Search ranks by caption features

**Status:** ready-for-human

- [ ] Baseline run recorded before the deploy.
- [ ] Rebuild completed, count and mapping checked.
- [ ] After run recorded and close to the simulation for the baseline nine:
      no 1–2-word captions on page 1, and 20 of 20 whole sentences for the
      common searches (rare ones like `serendipity` and `worcestershire` have
      fewer to give: 10 and 5 in the simulation).
- [ ] Transcripts show captions before and after a clip again.
