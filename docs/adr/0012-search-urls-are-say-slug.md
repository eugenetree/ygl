# Search URLs are `/say/{slug}`, and a slug searches for the same words as its query

A search lives at `/say/{slug}`, such as `/say/no-worries`. It no longer lives at
`/{query}` with the query percent-encoded (`/no%20worries`), as in the old
frontend.

To build a slug from a query:

1. Normalise the query to NFC and lowercase it.
2. Turn `’` into `'`.
3. Split it with `Intl.Segmenter` at word granularity and keep only the
   word-like segments.
4. Join them with hyphens.

To read a slug back, turn its hyphens into spaces.

`Intl.Segmenter` follows the same Unicode word-break rules (UAX #29) as
Elasticsearch's standard tokenizer, which the captions index uses. So the query
read back from a slug produces the same tokens as what was typed, and a shared
link finds the same clips. Examples:

- `9 a.m.` becomes `9-a.m`
- `the U.S.` becomes `the-u.s`
- `1,000 dollars` becomes `1,000-dollars`
- `well-known` stays `well-known`
- `rock 'n' roll` becomes `rock-n-roll`

## Considered options

- **Keep `/{query}`.** No redirects would be needed. But `/no%20worries` is ugly
  to share, and every root path the site needs (`/robots.txt`, future pages)
  would compete with queries.
- **A simpler slug: runs of `[a-z0-9]` joined by hyphens.** That splits `a.m`,
  `u.s` and `1,000` into different tokens, and decomposed accents too
  (`naïve` becomes `nai-ve`). A link would then search for something else:
  `9 a m` misses clips indexed under `a.m`, because the search requires every
  token.

## Consequences

- Nothing redirects, because no URL had been indexed when this was decided. A
  non-canonical slug (`/say/No%20Worries`) renders the same search, and its
  canonical link names the canonical slug. Reading a slug back and building it
  again must give the same slug, or that canonical link would name a different
  search.
- A query with no word-like segments (`!!!`) has an empty slug and finds no
  clips.
- Old `/{query}` URLs get a 404.
- The query in the URL is lowercase, so the page shows it lowercase
  (`i don't know`).
- Changing the rule later breaks or redirects every URL that search engines have
  indexed.
- Turning `’` into `'` changes the token. Captions spelled with `don’t` won't be
  found by `don't` until the index folds the two, which needs a `char_filter`
  and a reindex.
- The accent is a query parameter (`?accent=`), and the canonical URL omits it.
