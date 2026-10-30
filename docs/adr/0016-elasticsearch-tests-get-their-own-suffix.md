# Elasticsearch tests get their own suffix and script

Tests of the search ranking run against a real `elasticsearch:8.12.0` started
by Testcontainers, like the test Postgres (ADR-0002). They are named
`*.es.test.ts` and run only by `npm run test:es`; `npm test`, `npm run
test:unit` and the pre-commit hook leave them out. This is the revisit ADR-0002
asked for before adding a suffix: a fourth suffix was still the cheapest way to
keep the default run as it is.

## Why

- **Elasticsearch is heavy.** It wants about 1 GB of memory (a 512 MB heap plus
  the JVM) and takes tens of seconds to start. Putting it in `npm test` would
  make every commit (ADR-0003) pay for the few tests of the ranking.
- **The fake client can't rank.** The ranking is Elasticsearch's scoring, so a
  real one is the only place it can be tested at all; leaving these tests out
  of the default run is the price of having them.
- **The tests share one alias.** Searches and writes go through the `captions`
  alias, so two test files on one cluster would overwrite each other's index.
  `test:es` runs one file at a time (`--test-concurrency=1`) and starts a fresh
  container per run, never a reused one, where Postgres gives each file its own
  database cloned from a template.

## Considered options

- **Folding them into `.db`.** Every DB test run, and the pre-commit hook, would
  start Elasticsearch, and the DB tests would lose their parallelism to the
  shared alias.
- **Selecting by test name (`--test-name-pattern`) or by folder.** Either
  needs a convention as unenforced as a suffix, and both cut across the rule
  that a test file sits beside the file it tests and takes its name.

## Consequences

- Running `test:es` needs Docker and about 1 GB free; nothing runs it
  automatically, so a change to the ranking or the mapping has to be followed
  by running it by hand.
- The objections in ADR-0002 still stand: one dependency per file, kept by
  convention only. A file that needed both Postgres and Elasticsearch would fit
  neither suffix. Another dependency, or such a file, is the point to replace
  the suffixes with something that declares what a file needs, rather than add
  a fifth.
