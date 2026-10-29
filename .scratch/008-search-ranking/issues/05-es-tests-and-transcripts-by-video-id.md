# 05 — Elasticsearch tests, and transcripts looked up by `videoId`

**What to build:** a video's transcript (the captions shown before and after a
clip) is looked up by `term` on `videoId`, which the new mapping holds as a
keyword, instead of `videoId.keyword`. There is no transitional query on both
fields: until the rollout's rebuild switches the alias, transcripts come back
empty, and that window is accepted (spec, "Rollout").

This ticket also brings the first tests against a real Elasticsearch, which the
next ticket's ranking tests build on. They run `elasticsearch:8.12.0` in
Testcontainers (already a dependency for the test Postgres) under their own npm
script, kept out of the default test run because Elasticsearch needs about
1 GB. Each test creates its index with the real mapping through the same path
the rebuild uses, and writes fixture captions through the document function
from 02.

**Blocked by:** 03 — The search index stores documents of the new shape

**Status:** resolved

- [ ] The transcript lookup returns a video's captions in spoken order, and
      none of other videos', against a real Elasticsearch.
- [ ] Writing a document with a field the mapping doesn't have is rejected
      (`dynamic: strict`).
- [ ] The Elasticsearch tests have their own npm script, and the default test
      scripts don't start Elasticsearch.
- [ ] The mocked unit test asserting the transcript request shape is removed;
      the mocked tests of the search-unavailable path stay.
