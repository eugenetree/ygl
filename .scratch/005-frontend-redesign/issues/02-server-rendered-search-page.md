# 02 — The server renders a search page's clips

**What to build:** A listener (or a crawler) opening `/say/no-worries` gets HTML
that already holds:
- the heading "How to pronounce “no worries”";
- the count line "First 20 of 332 clips";
- the first 20 clips, each with its text (query words highlighted), its channel
  name and its start time in the video.

The frontend's server fetches them from the API at `API_URL` and caches the page
for an hour (ADR-0011). Searching again from the page's header goes to the new
search. Empty, failed and malformed searches get their own states.

A simple one-column layout is enough here. Ticket 05 builds the designed
layouts. Nothing plays yet; ticket 03 adds playback.

**Blocked by:** 01 — Replace the old app with the new one and build home

**Status:** resolved

- [ ] `/say/{segment}` searches for the canonical slug, `slug(unslug(decoded segment))`, read back as the query.
  - `/say/No%20Worries` finds the same clips as `/say/no-worries`.
  - Nothing redirects.
- [ ] The server fetches the first 20 clips (offset 0) from `API_URL`.
  - It reads only the path, never cookies or search params.
  - The page is cached for an hour, then served stale while it re-renders in the background.
- [ ] The first batch seeds the browser's search query in TanStack Query as its first page. The network tab shows no `/api/search` call on page load.
- [ ] The H1 reads "How to pronounce “{query}”", with no accent.
- [ ] The count line reads:
  - "First 20 of {total} clips";
  - "{n} clips" when everything arrived in the first batch;
  - `10,000+` as the total when it isn't exact, formatted for en-US.
- [ ] Each clip is a row button showing:
  - its number;
  - the clip's text, with query words highlighted;
  - a meta line with the channel name and the clip's start time in the video (m:ss).
- [ ] Highlighting splits text with the same `Intl.Segmenter` word segmentation as the slug and marks every word equal to a query word, case-insensitively.
- [ ] The page's header has:
  - the logo, which goes home;
  - a search form prefilled with the query, which stops at 200 characters.

  A new search adds a history entry. A blank query does nothing.
- [ ] Navigating to a new search inside the app shows a skeleton in the page's shape until the server's render arrives.
- [ ] No clips shows "No clips for “{query}”" with the Try links.
  - So does an empty canonical slug such as `/say/!!!`, without calling the API.
- [ ] If search is unavailable, the response is a 500 error page reading "Search is unavailable right now", with Retry.
  - The header search still works.
  - The error is never cached. A cached page whose refresh fails keeps its last good version.
- [ ] A path longer than 200 characters once read back shows a short message, with no API call.
- [ ] Old `/{query}` URLs get Next's 404.
- [ ] The footer follows the list.
- [ ] View-source shows the 20 clip rows in the HTML.
