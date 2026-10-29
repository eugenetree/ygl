# 04 — Ranking eval script

**What to build:** a local, read-only script the operator runs on their
machine to measure page 1 of a fixed set of searches on prod. It is committed
alongside the repo's other scripts and never deployed or run in a container.

For each of 30 searches it calls the public `/api/search` for page 1 (20 clips)
and prints a table: share of 1–2-word captions, share of whole sentences,
median word count, distinct videos, distinct channels (by channel name, which
the API returns). It counts words and whole sentences with the feature
functions from 02, so the metrics and the ranking agree. It also prints the top
few captions of a handful of searches, so a change can be seen as well as
counted.

Because it measures what is live, the same run gives the baseline before the
rollout and the result after it (07). The operator pastes each run into
`docs/seo/ranking-eval.md` with its date and phase; that file is never
committed (spec, "Further Notes").

The set (spec `.scratch/008-search-ranking/spec.md`, "Eval script"):
`strange`, `serendipity`, `worcestershire`, `once in a while`, `you know`,
`make sense`, `give up`, `by the way`, `the`, `really`, `actually`, `people`,
`beautiful`, `decision`, `although`, `whatever`, `ubiquitous`, `meticulous`,
`figure out`, `look forward to`, `come up with`, `get rid of`,
`piece of cake`, `at the end of the day`, `no way`, `as a matter of fact`,
`I don't know what`, `wonder`, `apple`, `don't`, `well-known`.

No tests: it's a local tool, and the logic it shares is tested in 02.

**Blocked by:** 02 — Caption features and the search index document

**Status:** resolved

- [ ] Runs locally against the public API with no credentials and makes only
      GET requests.
- [ ] Prints the five metrics per search, plus the top captions for a few.
- [ ] A search that fails or returns nothing shows as such in the table and
      doesn't stop the run.
- [ ] Run once against prod as a check; the output isn't committed.
