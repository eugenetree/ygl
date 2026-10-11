# 11 — Search engine metadata and link previews

**What to build:** Search results and shared links show what a page is about.
- A search page's title reads "How to pronounce “break the ice”: 332 real
  examples · saythis".
- It has a description built from the query and the count, and a canonical URL
  without the accent.
- A shared link unfurls with a generated image of the phrase, the count and the
  `[saythis]` logo.
- Pages with no clips are noindex.
- Home has its own title, description and image.
- The site serves `robots.txt` and a favicon.

**Blocked by:** 02 — The server renders a search page's clips

**Status:** ready-for-agent

- [ ] The search page's title is `How to pronounce “{query}”: {n} real examples · saythis`, with `{n}` formatted for en-US and `10,000+` when the total isn't exact.
- [ ] With no clips, the title is `No clips for “{query}”`, followed by ` · saythis`.
- [ ] The meta description is built from the query and the count, as in the spec's example.
- [ ] The canonical URL is `PUBLIC_ORIGIN` + `/say/{canonical slug}`, with no query string, so `/say/No%20Worries?accent=uk` names `/say/no-worries`.
- [ ] noindex is set on pages with no clips, an empty slug, or a path too long to search.
- [ ] Next generates a preview image for each search page: the phrase, the count line and the `[saythis]` logo, in the design's light palette. Home gets one too.
- [ ] The metadata reuses the page's own fetch, so one render makes one call to the API. Check the API's request log.
- [ ] Home's title and description come from the hero copy.
- [ ] `robots.txt` allows everything and lists no sitemap.
- [ ] The favicon is generated from the `[saythis]` logo.
- [ ] The html element's language is `en`.
- [ ] `PUBLIC_ORIGIN` is read on the server at runtime, not baked in at build time.
