# 02 — Caption features and the search index document

**What to build:** one pure function that turns a caption row and its video's
channel id into the search index document: `id`, `videoId`, `channelId`,
`startTime`, `endTime`, `text` exactly as stored, and three features —
`wordCount`, `startsSentence`, `endsSentence`. The feature functions are
exported on their own too, because the eval script (04) reuses them.

The features follow **Whole sentence** and **Fragment** in `CONTEXT.md`, and
the exact rules in the spec (`.scratch/008-search-ranking/spec.md`, "Terms"):
the opening and closing quotes and brackets that are skipped, `.`/`?`/`!`
(with `?!` and `!?`) as endings, a trailing ellipsis not counting, a word being
a token with a letter or a digit. They are computed on lightly normalized text
(entities decoded, HTML tags and zero-width characters removed, NBSP and line
breaks as spaces, one leading dialogue dash or `>>` dropped); the stored text is
not normalized.

Not wired into any writer yet.

**Blocked by:** None — can start immediately

**Status:** ready-for-agent

- [ ] Table-driven unit tests on real captions: "Strange.", "of life.",
      "- So is it a custom dish?", "every once in a while...",
      "Is it \"strange\"?", a line with `<i>` and NBSP, and
      "[Mary] one of Peter's favorite treats every once in a while." expecting
      `startsSentence: true` (a known limit until text clean-up).
- [ ] Edge cases from the spec: `"Strange," he said.` and `She said "no."` and
      `1990 was a good year.` and `Wait, what?!` are whole sentences;
      `iPhone sales went up.` and `...and then he left.` are fragments.
- [ ] Word count: `it's` is one word; `-`, `♪` and `>>` are not words.
- [ ] `text` in the document is byte-for-byte the stored caption text.
