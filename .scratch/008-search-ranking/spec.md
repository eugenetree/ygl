# Spec: Whole sentences of a comfortable length first in search

Status: ready-for-agent

## Problem Statement

A phrase page (`/say/<slug>`) is rendered on the server with its first 20
clips, for search engines and link previews, and cached for an hour. Those 20
clips are the page's content: they should be useful examples of the phrase, a
whole sentence of a comfortable length each.

Today they are mostly one-word captions. Search sorts by BM25, and BM25's length
normalization gives the top score to the shortest caption that contains the
query. Every "Strange." scores the same, and the random caption `id` decides the
order between them. Measured on prod on 2026-10-13:

| Search | Page 1 today |
|---|---|
| `strange` | "Strange." ×18, "strange,", "Strange, Defender Strange and Sinister Strange." |
| `make sense` | "Make sense?" ×11, "make sense." ×4, "doesn't make sense." |
| `give up` | "Give up?", "I give up!", "Don't give up." ×6 |
| `you know` | "You know, you know.", "you know that, you know that, you know that." |
| `the` | "The, the, the, the," and the like ×20 |

The data is fine: for every measured search, 60–80% of hits are 6–15 words
long. Across all 7.8M indexed captions, 26.4% are whole sentences and 15.1% are
whole sentences of 6–14 words. The ranking just never reaches them.

There is no way to measure a change to the ranking either: no fixed set of
searches, no page-1 metrics, no record of what the pages looked like before.

## Solution

Each caption in the search index carries three features computed when it is
indexed: its word count, whether it starts a sentence and whether it ends one.
Search drops BM25 and scores every hit from those features: a whole sentence of
6–14 words scores highest, short captions and fragments sink, and a hit with the
exact phrase multiplies its score by 3. In simulation over the whole corpus,
page 1 becomes:

| Search | Page 1 after |
|---|---|
| `strange` | "His keen eye immediately identified the strange ships nearing the shore." |
| `make sense` | "None of us, of course, can make sense of what happened to us." |
| `give up` | "Isis had lost Osiris for the second time, but she did not give up." |
| `you know` | "It just didn't come up like that, you know?" |
| `the` | "The deep water means that foundations are prohibitively expensive." |

The shown text doesn't change: the clip's caption is displayed as it is stored.

The search index gets a strict mapping with only the fields that are written,
so the documents can't drift from it again. Both writers, the rebuild and the
incremental sync, build documents with one shared function, and the
incremental sync stops dropping rejected documents silently.

A local eval script measures page 1 of 30 fixed searches through the public
search API, before and after, and the runs are kept with their dates.

Everything ships in one deploy followed straight away by `/rebuild_search_index`.

## User Stories

1. As a visitor on a phrase page, I want the first clips to be whole sentences, so that I hear the phrase used in a real sentence.
2. As a visitor, I want the first clips to be of a comfortable length, 6–14 words, so that each one is short enough to follow and long enough to give context.
3. As a visitor, I want one-word captions like "Strange." to sink below real sentences, so that page 1 isn't twenty copies of the query.
4. As a visitor, I want captions that repeat the query ("you know, you know") to stop filling page 1, so that every clip is worth playing.
5. As a visitor searching a multi-word phrase, I want clips with the exact phrase ahead of clips that only contain its words, so that I hear the phrase itself.
6. As a visitor searching a multi-word phrase, I want a whole sentence without the exact phrase to still beat a two-word phrase-only caption like "Make sense?", so that phrase matches don't bring the one-word pile back.
7. As a visitor, I want long whole sentences to rank above fragments of a comfortable length only down to a point, so that 25-word monologues don't crowd out normal sentences.
8. As a visitor, I want short captions and fragments to still be reachable further down, so that a rare word with few hits still shows everything it has.
9. As a visitor, I want the order of equally good clips to be the same on every visit and across rebuilds, so that paging doesn't skip or repeat clips.
10. As a visitor paging through results, I want every hit to appear exactly once across the pages, and the total to stay the same, so that "load more" is trustworthy.
11. As a visitor, I want the clip's caption shown exactly as it is shown today, so that this change doesn't alter what I read.
12. As a visitor, I want the captions before and after a clip to keep showing, so that I have context while the video plays.
13. As a visitor, I want search to keep answering throughout the deploy and the rebuild, even if the order is poor for a few minutes, so that the site never errors.
14. As a search engine, I want each phrase page's server-rendered clips to be full example sentences, so that the page is worth indexing for that phrase.
15. As a link preview, I want the first clip text to be a readable sentence, so that a shared link shows something meaningful.
16. As the operator, I want the ranking change to ship in one deploy followed by `/rebuild_search_index`, so that rolling it out is one hand-over.
17. As the operator, I want to verify after the rebuild that the document count matches and the live mapping is the new strict one, so that I know the rebuild took.
18. As the operator, I want a few minutes of poor order and missing neighbouring captions during the rebuild accepted in advance, so that I don't treat it as an incident.
19. As the operator, I want a failed incremental sync pass to retry the same captions next minute instead of losing them, so that a temporary Elasticsearch rejection (429) doesn't leave captions missing until the next rebuild.
20. As the operator, I want a failed pass to say in the `sync-elastic` logs which document was rejected and why, so that I can find a document-shape bug when I check the logs.
21. As the operator, I want to run an eval script on my machine that measures page 1 of a fixed set of searches on prod, so that I can see what a ranking change did.
22. As the operator, I want the eval script to only read, through the public search API, so that running it can never change prod.
23. As the operator, I want the baseline measured on prod before the deploy and the same run repeated after the rebuild, so that before and after are measured by the same tool.
24. As the operator, I want each eval run written down with its date and phase, so that later phases can be compared against it.
25. As the operator, I want the eval output to include the share of 1–2-word captions, the share of whole sentences, the median word count, and the distinct videos and channels on page 1, so that each goal of the ranking has a number.
26. As the operator, I want the eval set to cover common and rare words, phrasal verbs, idioms, long phrases, proper-noun traps and apostrophe/hyphen traps, so that a change that helps one kind of search and hurts another shows up.
27. As the operator, I want the ranking weights to live in code, so that tuning them needs a deploy but not a rebuild.
28. As a developer, I want one function that builds a search index document from a caption row, used by both the rebuild and the incremental sync, so that the two writers can't drift.
29. As a developer, I want the search index mapping to be strict, so that a document with an unexpected field is rejected instead of silently growing the mapping.
30. As a developer, I want dead fields (snake_case fields nobody fills, the unused analyzer, `text.keyword`, `type`, `duration`, `createdAt`, `updatedAt`, `channelSearchScore`) gone from the index, so that the mapping says what is actually stored.
31. As a developer, I want the channel id stored on each document now, so that spreading page 1 across channels (the next phase) needs no further rebuild.
32. As a developer, I want "whole sentence", "fragment" and "word count" defined once, with tests on real captions, so that the ranking and the eval script agree on them.
33. As a developer, I want the ranking tested against a real Elasticsearch, so that the scoring is verified by behaviour and not by the shape of the request.
34. As a developer, I want the incremental sync's own index creation removed, so that only the rebuild creates indices with the mapping.

## Implementation Decisions

**Terms.** *Whole sentence* and *Fragment* are in `CONTEXT.md`. The definitions
the features implement:

- **Starts a sentence:** past an optional dialogue dash or `>>`, and optional
  opening quotes or brackets (`" “ ' ‘ ( [ ¿ ¡`), the first character is a
  capital letter or a digit.
- **Ends a sentence:** the last character, ignoring closing quotes and brackets
  (`" ” ' ’ ) ]`), is `.`, `?` or `!` (including `?!` and `!?`). A trailing
  `...` or `…` does not count: nearly all of those trail off mid-sentence. `,`,
  `;`, `:` and `—` don't count either.
- **Word count:** the number of tokens that contain a letter or a digit. `it's`
  is one word; `-`, `♪` and `>>` are not words.
- All three are computed on lightly normalized text: entities decoded, HTML
  tags and zero-width characters removed, NBSP and line breaks turned into
  spaces, and one leading dialogue dash or `>>` dropped. Tag and speaker-label
  clean-up is not needed for this: across the corpus it moves the share of
  whole sentences from 26.4% to 26.3%. The stored and shown text is not
  normalized.
- Known limits, accepted: `[Mary] one of Peter's treats.` counts as a whole
  sentence (the `[` is skipped as an opening bracket) until text clean-up
  lands; `iPhone sales went up.` is a fragment; a caption that finishes the
  previous caption's sentence with a capital still counts as starting one.

**Search index document.** A pure function builds the document from a caption
row and its video's channel id. Both writers use it: the rebuild and the
incremental sync. The fields, and the mapping, which is `dynamic: strict`, one
shard, no replicas:

| Field | Type | Notes |
|---|---|---|
| `id` | keyword | caption id, also the document `_id` |
| `videoId` | keyword | |
| `channelId` | keyword | unused until the next phase |
| `startTime`, `endTime` | long | ms |
| `text` | text, standard analyzer, `norms: false` | exactly as stored today; norms are useless once BM25 is out of the score |
| `wordCount` | short | |
| `startsSentence`, `endsSentence` | boolean | |

Both repository reads that feed the writers (the incremental sync's and the
rebuild's per-video read) select the video's channel id and stop selecting the
channel's search score.

**Incremental sync.** It writes through the same index-writing path as the
rebuild, which fails when Elasticsearch rejects any document, and its own index
creation is removed. A failed pass already records `FAIL` and leaves the
watermark where it was, so the next pass retries the same captions; writes are
keyed by caption id, so a retry doesn't duplicate. Nothing alerts on failed
passes; the logs are watched by hand. An environment where no search index
exists yet is not handled (fresh environments are out of scope).

**Search query.** A `function_score` over a non-scoring AND match on `text`,
`score_mode: multiply`, `boost_mode: replace`. Each function's weight applies
when its filter matches; a hit no function matches scores 1.

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
| exact phrase (`match_phrase` on `text`) | 3 |

Resulting scores: a 6–14-word whole sentence 1.0; 15–18 / 19–24 / 25+ words
0.85 / 0.6 / 0.35; a 10-word caption missing one sentence boundary 0.6, missing
both 0.36; "Strange." 0.15; any of them ×3 with the exact phrase.

- The curve is asymmetric on purpose: short captions are penalized harder than
  long ones. A symmetric `gauss` on `wordCount` was considered and is the
  fallback if speed matters (458–517 ms on `the` against 700–960 ms).
- ×3 is about the smallest phrase weight that puts every comfortable-length
  phrase hit above every AND-only hit while keeping "Make sense?" (0.45) below a
  plain whole sentence (1.0).
- Addition (`score_mode: sum` with negative weights) was rejected: scores could
  go negative, which Elasticsearch refuses, weak captions would collapse into
  ties at 0, and an additive phrase bonus would lift junk phrase hits above good
  sentences.
- The weights are hand-set from a few searches and live in code. Tuning them is
  a deploy, not a rebuild.
- Sort stays `_score` desc then `id` asc, and `track_total_hits` stays 10000.
  Ties are frequent because the features are discrete; `id` is a random UUID
  that survives rebuilds, so ties are a stable shuffle.
- Speed, measured on prod with the same function shape on stand-in fields:
  `the` (2.7M hits) 700–960 ms, `you know` (116K) 97 ms, `strange` (8K) 17 ms,
  against 56–79 ms for `the` today. Pages are cached for an hour and `the` isn't
  a real target, so this is accepted.

**Video transcript.** The lookup of a video's captions (the captions before and
after a clip) queries `term` on `videoId` instead of `videoId.keyword`. There
is no transitional query on both fields.

**Rollout: one deploy, then the rebuild.** Until the rebuild switches the alias,
about 20 minutes, the old index is live:

- Search keeps working. The old index has no feature fields, so only the phrase
  filter matches: exact-phrase hits come first and the rest fall in `id` order.
- The old index maps `videoId` as `text`, so transcripts come back empty and
  clips show no captions before and after. A browser tab that loaded a
  transcript in that window keeps the empty one until reload.
- The incremental sync writes new-shape documents into the old, dynamic index;
  they go in and the rebuild replaces them.
- Phrase pages rendered in that window stay cached for up to an hour. Traffic is
  low, so the frontend cache isn't purged.

Hand-over to the operator: run the eval script for the baseline; deploy; run
`/rebuild_search_index` right after; check the document count and the live
mapping; rerun the eval script.

**Eval script.** A local, read-only script, committed with the repo's other
scripts, never deployed. For each search in a fixed set it calls the public
`/api/search` for page 1 (20 clips) and prints: share of 1–2-word captions,
share of whole sentences, median word count, distinct videos, distinct channels
(by channel name, which the API returns). It reuses the feature functions, so
"whole sentence" means the same in the metrics as in the ranking. Each run is
recorded with its date and phase, with the top few captions of some searches.

The set, 30 searches:

| Kind | Searches |
|---|---|
| Baseline nine | `strange`, `serendipity`, `worcestershire`, `once in a while`, `you know`, `make sense`, `give up`, `by the way`, `the` |
| Common word | `really`, `actually`, `people` |
| Everyday word | `beautiful`, `decision`, `although`, `whatever` |
| Rare word | `ubiquitous`, `meticulous` |
| Phrasal verb | `figure out`, `look forward to`, `come up with`, `get rid of` |
| Idiom | `piece of cake`, `at the end of the day`, `no way` |
| Long phrase | `as a matter of fact`, `I don't know what` |
| Proper-noun trap | `wonder`, `apple` |
| Apostrophe/hyphen trap | `don't`, `well-known` |

**Commits, in order:** (1) the document function and its feature functions,
not wired in; (2) the new mapping, both writers on the document function with
the channel id, the sync failing on rejected documents; (3) the eval script;
(4) the feature query and the transcript lookup on `videoId`, with the
Elasticsearch test harness. Then the hand-over above.

## Testing Decisions

Tests check behaviour seen from outside a module: what a search returns, what
lands in the index, what a pass records. Not the shape of the request sent to
Elasticsearch. Three seams:

1. **Search against a real Elasticsearch.** A new kind of test running
   `elasticsearch:8.12.0` in Testcontainers (already a dependency, used for the
   test Postgres), under its own npm script because Elasticsearch needs about
   1 GB. The index is created with the real mapping through the same path the
   rebuild uses, and about 60 fixture captions are written through the document
   function. It is the only test of the ranking itself, since the fake client
   can't rank. It asserts properties, not exact order:
   - nothing under 3 words in the top 10 when at least 20 good captions match;
   - exact-phrase hits come before AND-only hits;
   - a whole sentence beats a fragment of the same length;
   - pages 1..n together are a permutation of all hits, and `total` matches;
   - the transcript lookup returns a video's captions in spoken order by
     `videoId`;
   - a document with an unknown field is rejected (`dynamic: strict`).
2. **The writers, against the real test database and the fake Elasticsearch
   client.** Prior art: the rebuild use case's DB test, which is extended. A new
   DB test of the incremental sync use case sits beside it. Both writers write
   the document function's output, with the channel id. The incremental sync
   fails when Elasticsearch rejects a document (the fake can fail writes),
   records the pass as failed and leaves the watermark where it was.
3. **The document function, table-driven unit tests** on real captions:
   "Strange.", "of life.", "- So is it a custom dish?", "every once in a
   while...", "Is it \"strange\"?", "[Mary] one of Peter's favorite treats every
   once in a while." (expects `startsSentence: true`, a known limit), and a line
   with `<i>` and NBSP; plus the edge cases `"Strange," he said.`,
   `She said "no."`, `1990 was a good year.`, `iPhone sales went up.`,
   `...and then he left.`, `Wait, what?!`.

The existing mocked unit tests of the caption service that assert the search
and transcript request shapes (including the sort) are removed. Seam 1 covers
that behaviour. The mocked tests of error handling (search unavailable, the
retry when the index vanishes mid-search) stay.

The eval script has no tests: it is a local tool, and the logic it shares is
covered by seam 3.

## Out of Scope

- Spreading page 1 across videos and channels (next phase; the channel id is
  stored now for it).
- Cleaning caption text (`[Music]`, `(Laughter)`, speaker labels, `>>`) and any
  change to what is displayed.
- Context lines on phrase pages.
- Treating auto-caption copies or partial manual tracks differently.
- Demoting proper nouns ("Doctor Strange"), and stitching captions into
  sentences.
- Alerting on failed incremental sync passes.
- An environment with no search index yet (local first run, new machine).
- Purging the frontend page cache after the rebuild.
- Tuning the weights: the eval set is for that, after this ships.

## Further Notes

- **`docs/seo/` and `docs/research/` are never committed.** They are the
  operator's own working notes (the ranking research, the phased plan, the
  manual-captions audit, the eval runs). Read them for background if needed,
  write the eval runs to `docs/seo/ranking-eval.md`, but leave both
  directories untracked: never stage them, and never link to them from
  committed files.
- Leftovers expected after this phase, from the simulation: one channel can
  hold many page-1 slots (8 of 20 for `you know`, 6 of 20 for `strange`);
  speaker labels and tags stay in shown text; "Doctor Strange" captions reach
  page 1; videos with no punctuation (about 3%) never have whole sentences and
  sink.
- Copies of YouTube's auto captions published as manual tracks are about 9% of
  indexed captions. They have whole sentences about as often as other tracks
  (22.7% against 24.1%), so these features neither raise nor sink them.
- The incremental sync only adds: a video that left search keeps its captions in
  the index, and one that became searchable later doesn't get its older
  captions. Only a rebuild fixes either, so this phase's rebuild also catches
  those up.
