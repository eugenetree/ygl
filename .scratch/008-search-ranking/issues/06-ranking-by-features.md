# 06 — Search ranks by caption features

**What to build:** search scores every hit from its stored features instead of
BM25, so page 1 of a phrase page is filled with whole sentences of 6–14 words,
exact-phrase hits come first, and one-word captions sink without disappearing.

A `function_score` over a non-scoring AND match on `text`, with
`score_mode: multiply` and `boost_mode: replace`; the weights live in code
(spec `.scratch/008-search-ranking/spec.md`, "Search query"):

| Filter | Weight |
|---|---|
| `wordCount` ≤ 2 | 0.15 |
| `wordCount` 3–4 | 0.4 |
| `wordCount` 5 | 0.7 |
| `wordCount` 6–14 | none (1) |
| `wordCount` 15–18 | 0.85 |
| `wordCount` 19–24 | 0.6 |
| `wordCount` ≥ 25 | 0.35 |
| `startsSentence` false | 0.6 |
| `endsSentence` false | 0.6 |
| exact phrase | 3 |

Sort stays `_score` desc then `id` asc, `track_total_hits` stays 10000, and the
retry when the index vanishes mid-search stays.

**Blocked by:** 05 — Elasticsearch tests, and transcripts looked up by
`videoId`

**Status:** resolved

- [ ] Against a real Elasticsearch with about 60 fixture captions, asserting
      properties rather than exact order:
  - [ ] nothing under 3 words in the top 10 when at least 20 good captions
        match;
  - [ ] exact-phrase hits of a comfortable length (6–14 words) come before
        AND-only hits;
  - [ ] a whole sentence beats a fragment of the same length;
  - [ ] pages 1..n together are a permutation of all hits, and `total` matches.
- [ ] The mocked unit test asserting the search request shape and sort is
      removed; the mocked tests of the search-unavailable path and the retry
      stay.
