# Besides the clip list, what content could go on a phrase results page (`/say/{slug}`, e.g. `/say/break-the-ice`) of the redesigned frontend (`.scratch/005-frontend-redesign/`) so the page has more substance for search engines and readers? Where could the data for each kind of content come from?

**Parked:** 2026-10-12 · `drvnk/redesign` @ `f89c6ad`
**Where:** `.scratch/005-frontend-redesign/design/mobile.html`, `src/modules/captions-search/captions.service.ts`, `src/modules/api/contract/search.ts`, `src/modules/api/contract/captions.ts`, `CONTEXT.md`, `frontend/app/lib/data.ts`

## Doubt

The mobile results design (file `.scratch/005-frontend-redesign/design/mobile.html`, variant "2a"; it's a self-extracting Claude Design bundle, so the markup is gzip+base64 inside `<script type="__bundler/...">` tags) puts three sections under the clip list: "Related searches" (chips like testing, tested, contest, test drive), "About “test”" (IPA such as /tɛst/ plus a note on pronunciation) and "Common phrases" (put to the test, test the waters…). None of them has any data behind it. The user said: "I believe I want some general investigation of what kind of content I can put on such pages so it has more content". The user wants this investigated before deciding which sections to build. They're parked for now and are not part of the first version of the redesigned frontend.

## Sanity check

**holds**: The three sections exist in the design's `__bundler/template` (headings "Related searches", "About “test”" with "Pronounced /tɛst/ in American and British English…", and "Common phrases" with "put to the test"), and nothing in the backend can feed them: `clipSchema` in `src/modules/api/contract/search.ts:35-46` carries only clip, video title and channel name, and the `captions` index uses the plain `standard` analyzer (`src/modules/captions-search/captions.service.ts:177`), with no dictionary, IPA or word-list source anywhere in `src/`. The old `frontend/` already holds exactly this kind of made-up data: the `Phrase` type has `ipa` and `nearSynonyms` (`frontend/app/lib/data.ts:39,45`) and is filled from `MOCK_RESULTS` (`frontend/app/lib/data.ts:53`), so the concern about mock content being indexed is a live risk, not a hypothetical one. The design's claim "in every accent we index" also has no data behind it, since accents are UI-only.

## Context

- The product is saythis.co. You search YouTube captions for a word or phrase and play each clip at the moment it's said.
- Data lives in Postgres and Elasticsearch:
  - Postgres has videos (title, duration, thumbnail, languageCode…) and channels (name, countryCode…).
  - Elasticsearch has a `captions` index using the standard analyzer (see `src/modules/captions-search/captions.service.ts`).
  - There is no dictionary, word list or IPA data. The only "dictionary" match in the repo is `src/modules/scraping/scrapers/channel-discovery/data/prod.json`.
- The API contract lives at `src/modules/api/contract/`:
  - `search.ts`: clips with video title, channel name, start/end, text and play-from; plus total and isTotalExact.
  - `captions.ts`: all captions of one video.
- Vocabulary is in `CONTEXT.md` (Search, Clip, Caption, Play-from point…).
- Decided so far for the new frontend:
  - The first page of clips is server-rendered for SEO.
  - The H1 is "How to pronounce “{phrase}”", with no accent mentioned.
  - A visible list of the loaded clips is shown on the page.
  - Accents are UI-only for now, and there's no accent data.
  - No sitemap yet, because there's no list of phrases to build it from.
- A concern raised in the session: mock or placeholder content would get indexed as if it were real, so it shouldn't ship as fake data.
