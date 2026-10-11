# Spec: The redesigned frontend

Status: ready-for-agent

## Problem Statement

saythis.co has a new design, made in Claude Design on shadcn's visual
language, and the current frontend looks nothing like it. Beyond the looks, the
current frontend falls short in ways a listener and the site's owner both feel.

**Search engines see an empty page.** Search runs only in the browser, so the
HTML of a results page holds no clips, no count and no caption text. Google
renders JavaScript late and in a queue. Link previews in Telegram, Slack or X
never run it, so a shared link shows nothing about the phrase. For a site that
wants to rank for "how to pronounce …", this is the biggest gap.

**There's no list of clips.** A listener sees one clip at a time and can only
step through with Previous and Next. They can't scan the sentences, see which
channels say the phrase, or jump straight to a clip that looks useful.

**URLs are awkward.** A search lives at `/{query}` with the query
percent-encoded, as in `/no%20worries`. That is ugly to share, and the root path
space is taken by queries.

**Playback controls are thin.** There is no speed control, and Loop has to be
reached by mouse. The theme toggle resets on every page load. The layout isn't
designed for phones or tablets, which is where people often check how a word is
said in the middle of a conversation.

**The code is hard to change safely.** Data fetching is hand-rolled with
`useEffect` and manual race guards. Nothing in the pre-commit hook lints or
typechecks the frontend.

## Solution

The current frontend is replaced in place by a new Next.js app that implements
the design. It covers desktop, tablet and phone layouts and a light and dark
theme.

- **Home** has the headline, a search box with an accent picker, "Try" links
  and a "How it works" section.
- **A search page** lives at `/say/{slug}`, as in `/say/no-worries`.
  - The server renders it with its first 20 clips, so search engines and link
    previews see real content. The title says how many real examples exist.
  - The page shows the YouTube player with our control bar, a caption card that
    follows the speech line by line, and the list of clips. The listener can
    scan the list and play any clip from it.
  - The list sits in a pinned side column on wide screens and under a pinned
    player on phones and portrait tablets.
- **Clips play** from their play-from point. Each one tries to autoplay. Loop
  repeats the clip until the listener moves on, and speed can be slowed to 0.5×.
  Everything has a keyboard shortcut.
- **The accent picker** behaves as designed, but sends nothing to the API, since
  no accent data exists yet.
- **Sign-in with Google**, the account menu and account deletion work as they do
  today, in the new header.

## User Stories

### Finding a phrase

1. As a listener, I want to type a word or phrase on home and press Search, so that I hear it said in real videos.
2. As a listener, I want "Try" links with example phrases on home, so that I can see how the site works without thinking of a phrase.
3. As a listener, I want a short "How it works" section on home, so that I understand the three steps before I search.
4. As a listener, I want to search again from the search page's header, so that I don't have to go back home for every phrase.
5. As a keyboard user, I want `/` to put the cursor in the search box, so that I can start a new search without the mouse.
6. As a listener, I want the search box to stop at 200 characters, so that I never hit an error for a phrase that is too long.
7. As a listener, I want pressing Search on an empty box to do nothing, so that I don't land on an empty page.
8. As a listener, I want each new search to be a browser history entry, so that Back returns me to my previous search.

### Links and URLs

9. As a listener, I want search URLs like `/say/no-worries`, so that a link I share is readable.
10. As a listener sharing a link, I want it to find exactly the clips I found, so that `9 a.m.` and `1,000 dollars` don't turn into different searches.
11. As a listener who typed a URL by hand in another form (`/say/No%20Worries`), I want it to find the same clips, so that small differences in a link don't break it.
12. As the site's owner, I want every form of a search's URL to name one canonical address, so that each search ranks as one page.
13. As a listener, I want my accent choice in the URL, so that a link I share opens with the same accent.
14. As a listener, I want stepping through clips to leave my history alone, so that Back leaves the search instead of stepping back through 30 clips.

### The search page

15. As a listener, I want the page to open with clip 1 ready at its play-from point, so that I hear the phrase straight away.
16. As a listener, I want to see the video's title and channel name, so that I know who is speaking.
17. As a listener, I want to see which clip I'm on out of how many, so that I know how far through the results I am.
18. As a listener, I want to see the line before and after the one being spoken, so that I can follow the sentence in context.
19. As a listener, I want the words of my query highlighted wherever they appear, so that I can spot the phrase at a glance.
20. As a listener, I want the caption card to follow the speech line by line when I let the video play on, so that I can keep reading along.
21. As a listener, I want a progress bar for the clip, so that I can see when the phrase is about to end.
22. As a listener, I want the current time in the video, so that I can find the moment again on YouTube.
23. As a listener, I want a heading that says "How to pronounce “no worries”", so that the page clearly tells me what it shows.
24. As a listener, I want a list of the clips with each sentence and its channel, so that I can scan how the phrase is used.
25. As a listener, I want to click or tap a row in the list to play that clip, so that I can jump to the one that looks most useful.
26. As a listener, I want the playing clip marked in the list, so that I know where I am.
27. As a listener, I want a "Show more clips" button at the end of the list, so that I can see beyond the first 20 without endless scrolling.
28. As a listener, I want the list to say how many clips it holds and how many exist ("First 20 of 332 clips"), so that I know what more is available.
29. As a listener, I want the count to read "10,000+" when there are more than ten thousand clips, so that it is never a wrong exact number.

### Playback

30. As a listener, I want each clip to start playing on its own, so that I don't have to press Play for every clip.
31. As a listener arriving from Google, I want clip 1 to wait paused with Play ready when my browser blocks autoplay, so that one click starts it.
32. As a listener, I want Loop on by default, so that the clip repeats until the pronunciation sticks.
33. As a listener, I want Loop off to let the video play on, so that I hear what comes after the phrase.
34. As a listener, I want to replay the clip from its play-from point, so that I can hear it again at once.
35. As a listener, I want Previous and Next to move between clips and start the new one playing, so that I can step through quickly.
36. As a listener, I want Previous disabled on the first clip and Next disabled on the last, so that the controls never pretend there's more.
37. As a listener, I want more clips to load on their own when I step past the last loaded clip, so that stepping never runs dry early.
38. As a listener, I want to slow playback to 0.75× or 0.5×, so that I can hear each sound clearly.
39. As a listener, I want my speed remembered across clips and visits, so that I don't set it every time.
40. As a listener, I want YouTube's own controls to stay available, so that I keep volume, fullscreen and captions.
41. As a listener, I want my speed control to follow a change I make in YouTube's own menu, so that the two never disagree.
42. As a listener, I want seeking away from the clip with YouTube's seek bar to be respected, so that Loop doesn't yank me back.
43. As a listener, I want a video that can't be played here to be skipped with a short notice, so that blocked embeds don't stop me.

### Keyboard

44. As a keyboard user, I want Space or K to play and pause, so that I don't reach for the mouse.
45. As a keyboard user, I want ← / → (or P / N) for previous and next, so that I can step through clips by keyboard.
46. As a keyboard user, I want L to toggle loop, R to replay and S to cycle speed, so that every control has a key.
47. As a keyboard user, I want 1–5 to pick an accent, so that I can switch accents quickly.
48. As a keyboard user, I want a row of shortcut hints under the player on desktop, so that I can learn the keys.
49. As a keyboard user, I want shortcuts ignored while I type in the search box, so that typing never triggers playback.
50. As a keyboard user, I want Esc to only close menus, so that I never lose my results by accident.

### Accent

51. As a listener, I want to pick American, British, Australian, Canadian or Irish English, so that I can hear the accent I'm learning.
52. As a listener, I want switching accent to restart at clip 1, so that I start the new accent from the top.
53. As a listener, I want American as the default with no parameter in the URL, so that plain links stay clean.

### Layouts

54. As a desktop listener, I want the player, caption and shortcuts to fit in my window, so that I never scroll to see the line being spoken.
55. As a desktop or landscape-tablet listener, I want the clip list beside the player, with the player pinned while the list scrolls, so that I can browse clips while one plays.
56. As a phone or portrait-tablet listener, I want the player pinned at the top while the list scrolls under it, so that the video stays in view while I browse.
57. As a phone listener, I want the pinned player to let go when the list ends, so that the footer reads normally.
58. As a listener on a phone held sideways, I want the player not pinned, so that it doesn't cover the whole screen.
59. As a portrait-tablet listener, I want the list in two columns, so that the space under the player isn't wasted.
60. As a phone listener, I want touch-sized controls with speed and time, so that I can use everything one-handed down to a 360px screen.
61. As a listener rotating a tablet, I want the video to keep playing as the layout changes, so that rotating doesn't restart the clip.

### States

62. As a listener, I want placeholder blocks while a new search loads, so that the page doesn't jump when the clips arrive.
63. As a listener, I want "No clips for “xyz”" with Try links when nothing matches, so that I have somewhere to go next.
64. As a listener, I want "Search is unavailable right now" with Retry when search is down, so that I know it isn't my query's fault.
65. As a listener, I want a short message for a hand-typed URL longer than 200 characters, so that I see an explanation instead of an error.
66. As a listener, I want a notice and a retry when the next batch of clips fails to load, so that one failure doesn't end my results.

### Account

67. As a signed-out listener, I want a "Sign in" button in the header of every page, so that I can sign in from anywhere.
68. As a listener signing in, I want to come back to the same search and accent, so that signing in doesn't interrupt me.
69. As a signed-in listener, I want my Google avatar in the header with a menu of my name, email, Sign out and Delete account, so that I can manage my account.
70. As a signed-in listener, I want deleting my account to ask for confirmation, so that I don't delete it by accident.
71. As a listener whose session is too old to delete the account, I want to be asked to sign in again, so that deletion still works.
72. As a signed-in listener, I want the header to never flash "Sign in" while it checks who I am, so that the page doesn't flicker.

### Theme

73. As a listener, I want the site to follow my system's light or dark setting, so that it matches my device.
74. As a listener, I want a sun/moon button to switch theme, so that I can choose differently for this site.
75. As a listener, I want my theme choice remembered, with no flash of the wrong theme on load, so that the site always opens the way I left it.

### Search engines and link previews

76. As the site's owner, I want search pages rendered on the server with their first 20 clips, so that search engines index real sentences.
77. As the site's owner, I want the title "How to pronounce “break the ice”: 332 real examples · saythis", so that search results show the phrase first and the brand last.
78. As the site's owner, I want a meta description and a canonical URL without the accent, so that each search ranks as one page.
79. As the site's owner, I want a generated preview image with the phrase, the count and the logo, so that shared links look like saythis.
80. As the site's owner, I want pages with no clips marked noindex, so that empty pages don't dilute the site.
81. As the site's owner, I want a failed search to return an uncached error, so that crawlers retry later instead of indexing an error page.
82. As the site's owner, I want search pages cached for an hour, so that crawlers walking thousands of phrases don't overload Elasticsearch.
83. As the site's owner, I want a robots.txt and a favicon, so that the site looks complete to crawlers and in browser tabs.

### Operator and maintainer

84. As the operator, I want the frontend's server to reach the API through one setting, so that moving the API later is an env change.
85. As the operator, I want the frontend deployed exactly as today, from the same Dockerfile location, so that Dokploy's settings stay as they are.
86. As the maintainer, I want the frontend linted by Biome and typechecked in the pre-commit hook, so that mistakes are caught before they're committed.
87. As the maintainer, I want the API's types imported from the contract, so that a renamed field breaks the frontend's build instead of the page.

## Implementation Decisions

### The app and its stack

- The new app replaces the old one in the frontend folder. There is no parallel
  folder and no rename step. The old app's files are deleted first, and main
  keeps the old app until this branch merges.
- Latest stable Next.js (16.3 at the time of writing), App Router, React 19,
  TypeScript strict, standalone output. npm, as in the rest of the repo.
- Tailwind v4 with shadcn/ui components, lucide-react icons (in place of the
  design's text glyphs ⌕ ← → ↻ ▼), sonner for toasts, and the `geist` package
  for Geist and Geist Mono.
- TanStack Query for everything fetched in the browser: later batches of clips,
  each video's captions, the signed-in user, and the sign-out and delete
  mutations. No `useEffect` + fetch.
- The YouTube IFrame API is wrapped in our own hook. No third-party YouTube
  wrapper.
- better-auth's React client for sign-in, sign-out and account deletion, on the
  site's own origin (ADR-0005, ADR-0008).
- The API's request and response types come from the shared contract by a
  type-only import through a path alias, as the old frontend does. No backend
  code reaches the bundle.
- The theme uses our own pre-paint script and hook, not next-themes (see Theme).
- Composition and React patterns follow the repo's vercel-composition-patterns,
  vercel-react-best-practices and web-design-guidelines skills.

### Routes and URLs (ADR-0012)

- `/` is home. `/say/{slug}` is a search page. `?accent=uk|au|ca|ie` holds the
  accent, and American is the default, never written to the URL.
- The slug rule was checked in a prototype against 18 cases (`No worries!`,
  `9 a.m.`, `the U.S.`, `1,000 dollars`, a decomposed `naïve`, `don’t`, `3.5`,
  `e.g. this`, `24/7`, `well-known`, `foo_bar`, `rock 'n' roll`, `'cause`,
  `!!!`, `café`, and more). Every case round-trips and is idempotent:

  ```js
  const seg = new Intl.Segmenter("en", { granularity: "word" });
  const words = (s) =>
    [...seg.segment(s.normalize("NFC").toLowerCase())]
      .filter((x) => x.isWordLike)
      .map((x) => x.segment);
  const slug = (q) => words(q.replaceAll("’", "'")).join("-");
  const unslug = (s) => s.replaceAll("-", " ");
  ```

- **No redirects:** Google hasn't crawled the site yet, so there are no indexed
  URLs to preserve.
  - **The canonical slug** is `slug(unslug(decoded segment))`. Any
    `/say/{segment}` renders the search for it, and the page's canonical link
    points at that slug.
  - **An empty canonical slug** (`/say/!!!`) renders the no-clips state without
    calling the API.
  - **Old `/{query}` URLs** are not redirected, so they get a 404.
- **The query searched and shown** on the page and in the search box is the
  canonical slug read back, so it is lowercase.
- **History:**
  - A new search adds a history entry.
  - Previous, Next, list rows and accent changes replace the URL or leave it
    alone; they never add entries.
  - There is no clip position in the URL. A stable `?clip=<captionId>` can come
    later, with its canonical pointing at the search page.

### Server rendering and caching (ADR-0011)

- **The server render:** the search page is rendered on the server with the
  first batch of 20 clips, the total and whether it is exact. It is fetched from
  the API at a server-only `API_URL`: `http://localhost:3001` in development,
  `http://api:3001` on Dokploy over `dokploy-network`. The same fetch feeds the
  page's metadata, so one render makes one API call.
- **Cached by path:** the server reads only the path. The accent, the signed-in
  user and video captions are read in the browser, so the HTML is identical for
  every visitor.
- **Revalidation:** each search page is cached for one hour, then served stale
  while a fresh copy renders in the background.
- **Search unavailable** during a render throws to an error page with status
  500. It is never cached, and a cached page whose refresh fails keeps its last
  good version.
- **Handing over to the browser:** the server's first batch seeds the browser's
  search query as its first page, so the browser never refetches it. The
  browser fetches later batches from `/api/search` directly, with relative
  paths (ADR-0008).
- **Absolute URLs:** canonical URLs, preview images and the preview image's
  metadata come from `PUBLIC_ORIGIN`, the same variable the API uses.
- **Development:** `next dev` runs on port 3000 and rewrites `/api/*` to port
  3001, so the browser stays same-origin. `PUBLIC_ORIGIN` and the Google
  redirect URI are unchanged.

### Search engine metadata

- **Search page title:**
  - `How to pronounce “{query}”: {n} real examples · saythis`.
  - `{n}` is formatted for en-US. When the total isn't exact, it reads
    `10,000+`.
- **No clips:**
  - The title is `No clips for “{query}” · saythis`.
  - The page is noindex. A too-long URL and an empty slug are noindex too.
- **Meta description:** built from the query and the count, e.g. "Hear “break
  the ice” said in 332 real YouTube clips, each starting right where it's said."
- **Canonical URL:** `PUBLIC_ORIGIN` + `/say/{slug}`, with no query string.
- **Preview image:** generated by Next for each search page, showing the
  phrase, the count line and the `[saythis]` logo in the design's palette. Home
  gets one too.
- **Home:** its title and description come from the hero copy ("Hear how it's
  actually said.").
- **Site files:**
  - `robots.txt` allows everything and lists no sitemap yet.
  - The favicon is generated from the `[saythis]` logo.
  - The page language is `en`.

### Clips and paging

- **Batches:** clips arrive in batches of 20 from `/api/search` by offset. Clips
  are deduplicated by caption id across batches.
- **The next batch is requested when:**
  - the playing clip reaches the last loaded clip;
  - the listener presses "Show more clips" at the end of the list.
- **No infinite scroll**, so the pinned player can let go at the end of the list
  and the footer stays reachable.
- **The list's count line:**
  - "First {loaded} of {total} clips", using `10,000+` when the total isn't
    exact;
  - "All {n} clips" once everything has loaded;
  - "{n} clips" when everything arrived in the first batch.
- **A failed batch** keeps the listener on the current clip and shows a toast.
  Next or "Show more clips" retries.
- **Ends of the list:** Previous is disabled on clip 1. Next is disabled on the
  last clip once no more batches exist. Nothing wraps around, unlike the
  design's mock.
- **Each video's captions** (`/api/videos/:videoId/captions`) are fetched when
  one of its clips becomes current, and cached per video. Until they arrive, the
  caption card shows only the clip's own line.

### Accent (UI only)

- **The five accents:** American (US), British (UK), Australian (AU), Canadian
  (CA) and Irish (IE). There are pickers on home and in the search page's
  header, and keys 1–5 pick them.
- **The menu** has an "Accent" heading, a ✓ by the current accent, and each
  accent's name and code. There are no per-accent counts, unlike the design.
- **Switching accent** restarts at clip 1 of the same clips, with no refetch.
- **Nothing accent-related is sent to the API.** The H1, title and the line
  under the video title don't mention the accent, because the clips don't
  depend on it.
- **An unknown `?accent` value** falls back to American.

### Search page layout

The three design files define three layouts on one page structure. CSS alone
switches between them, so the YouTube iframe is never remounted and rotating a
tablet doesn't reload the video.

- **Side list.** Used at 960px wide and up when the screen is wider than tall:
  desktop and landscape tablets.
  - **Two columns:** the player column on the left, and the clip list on the
    right at 300–360px. The page is up to 1280px wide.
  - **Pinned player:** the player column (title row, video, control bar,
    caption card, shortcuts row) is pinned while the list scrolls with the page.
    The list doesn't scroll inside its own box, unlike the desktop design's side
    queue.
  - **Fit to screen:** the video's width is capped so the whole player column
    fits the window height. The width is at most (window height − 380px) × 16/9
    and at least 472px.
  - **The header** is the design's sticky 56px results header with a blurred
    background:
    - the logo, which goes home;
    - the search form, at most 520px, with ⌕ and a `/` hint;
    - the accent button "American ▾";
    - the theme toggle and the sign-in button or avatar.
  - **The title row** shows the video title and its channel name, with
    "{n} of {total}" on the right.
- **Sticky player.** Used below 960px, or when the screen is taller than wide:
  phones and portrait tablets.
  - **The header** scrolls away.
    - On tablets it holds the logo, a search box (at most 440px) with the accent
      name inside it, and "{n} / {total}".
    - On phones it holds the logo and a search box with the accent code as a
      chip inside it.
    - Both gain an icon-sized theme toggle and the sign-in button or avatar.
  - **The pinned block** holds the full-width video, the progress bar, the
    control bar and the caption card.
  - **The list:** the H1 and the clip list follow below, in one column on phones
    and two from about 640px wide.
  - **Release:** the pinned block lets go when the list ends. There is no video
    title row in this layout.
- **Short screens.** Below 500px tall, as on a phone held sideways, the player
  isn't pinned at all.
- **The H1** reads "How to pronounce “{query}”". It sits at the top of the list
  column, or above the list under the pinned block, with the list's count line
  under it.
- **List rows:**
  - Each row is a button: a number (▶ in the mark-line colour on the playing
    row), the clip's text with query words highlighted, and a meta line with
    the channel name and the clip's start time in the video.
  - The playing row has the soft background and the yellow mark. The other rows
    show matched words in bold.
  - Activating a row plays that clip from its play-from point.
- **The control bar:**
  - **Side list:** Previous, Play/Pause (primary, at least 84px wide), Next, a
    separator, the "Loop caption" switch, speed, and the time on the right.
  - **Sticky player:** 44px touch buttons: ←, Play/Pause, →, a "↻ Loop" toggle
    and speed. The time sits on the right, and on phones so does "{n}/{total}".
    At 360px the Loop label shrinks to its icon so the row fits.
- **The caption card:**
  - The line before, then the main line, then the line after.
  - The main line is 24px on desktop and tablet and 20px on phones. The faint
    lines around it are 15px, 14px and 13px respectively.
  - Matches get the yellow mark with an inset mark-line underline.
- **The shortcuts row** shows Space Play/pause, ← → Prev/next, L Loop, R Replay,
  S Speed and 1–5 Accent. It appears only in the side-list layout, and never on
  touch devices.
- **The footer** ("© 2026 saythis.co", no links) shows on home, and on search
  pages after the list.

### Playback

- **The player:** our hook creates the YouTube player with YouTube's own
  controls shown, `rel=0` and `playsinline=1`.
  - The IFrame API has no time-update event, so the hook polls the current time
    about four times a second.
  - Switching clips loads the new video or seeks within the same one.
- **Clip range:** from the play-from point to the caption's end.
- **Autoplay:** every clip load tries to play with sound: page load, Previous,
  Next, a list row, an accent switch.
  - When the browser blocks it (YouTube's `onAutoplayBlocked`), the clip waits
    paused at its play-from point with Play ready.
  - There is no muted autoplay.
  - On a touch device, if pressing our Play doesn't start playback within about
    a second, a hint shows: "Tap the video to start". Some mobile browsers only
    allow scripted playback after the video itself has been tapped once.
- **Loop:**
  - It is on by default. When playback crosses the caption's end from inside the
    clip, it jumps back to the play-from point.
  - Seeking out of the clip is respected.
  - With Loop off, the video plays on.
  - R replays from the play-from point.
- **The caption card is a rolling window.** The middle row is the line being
  spoken, with the previous line above and the next below.
  - During the lead-in before the clip's caption starts, the middle row already
    shows the clip's line.
  - Past the clip, with Loop off, it rolls forward line by line, highlighting
    query words wherever they appear.
- **The progress bar** shows progress from the play-from point to the caption's
  end, and stays full once past it.
- **The time label** shows the time in the video (m:ss, in Geist Mono).
- **Speed:**
  - The options are 0.5×, 0.75× and 1×. S cycles them.
  - The choice carries over to the next clip and is kept in localStorage.
  - It follows YouTube's own rate-change event.
- **A video that can't be played** (removed, or embedding blocked) is skipped in
  the direction of travel, with the toast "Skipped a video that can't be played
  here".

### Highlighting

- Caption text is split with the same word segmentation as the slug
  (`Intl.Segmenter`, NFC, case-insensitive comparison). Every word equal to a
  word of the query is highlighted, in the caption card and the list.
- This replaces the old frontend's letters-and-digits regex, so highlighting
  agrees with how the query is read from the URL.

### Keyboard

- **The keys:**
  - `/` focuses the search box;
  - 1–5 pick an accent;
  - Space or K plays and pauses;
  - → or N goes to the next clip, ← or P to the previous one;
  - L toggles loop, R replays, S cycles speed.
- **When the keys are ignored:** while focus is in an input or textarea. While
  the YouTube iframe has focus, its own keys apply.
- **Esc** closes menus and dialogs only. The design's "Esc goes home" is
  dropped.

### Header and account

- **Placement:** sign-in sits at the right of every header, after the theme
  toggle.
- **The slot is reserved** until `/api/me` answers, so a signed-in listener
  never sees "Sign in" flash.
- **Signed out:** an outlined "Sign in" button. It goes straight to Google and
  returns to the current URL, path and `?accent` included. A failed sign-in
  returns to the same URL.
- **Signed in:** the Google avatar (loaded without a referrer) opens a menu with
  the name and email, Sign out, and Delete account.
- **Delete account** opens a confirmation dialog.
  - Its steps are: confirming, deleting, failed, or session too old.
  - "Session too old" is better-auth's `SESSION_EXPIRED` (freshAge is one day).
    It offers "Sign in again", which returns to the same page.
- **Home's header** shows only the logo, the theme toggle and sign-in. The
  design's Docs and API links are dropped.

### Theme

- **Before first paint:** an inline script in the root layout's head reads the
  stored choice, falls back to `prefers-color-scheme`, and sets the `dark` class
  on the html element. The html element suppresses the hydration warning for
  that class.
- **The toggle:** a sun/moon button stores the choice in localStorage. Until
  then the page follows the system, including changes while it is open. Other
  open tabs follow a change.
- **No dev warning:** the script must not trigger React's "script tag while
  rendering" warning in development. Check the console.
- **The palettes:**
  - **Light:** text #09090b, muted #71717a, faint #a1a1aa, sub #3f3f46,
    surface #fff, soft #f4f4f5, soft2 #ececee, kbd #fafafa, lines #e4e4e7, page
    #fafafa.
  - **Dark:** text #ededef, muted #a1a1aa, faint #7c7c85, sub #d4d4d8, surface
    #1e1e21, soft #2b2b2f, soft2 #252529, kbd #26262a, lines #323237, page
    #18181b.
  - **Primary:** #18181b (hover #27272a, on-primary #fafafa) in light. In dark it
    turns to #fafafa with #18181b on it, and the mark line becomes #fafafa.
  - **The mark:** #fef08a with a #ca8a04 mark line in both themes, and #09090b
    text on it in dark.

### Home

- **The design's chosen settings:** logo Brackets, theme Zinc, background Zinc,
  skin Default, search position Top, YouTube logo on, How it works on, footer
  on. Trending, Compare and Word of the day are off.
- **The header** is 56px with a bottom border.
- **The hero:**
  - the pill "English · 5 accents";
  - the H1 "Hear how it's actually said." (44px, about 32px on phones);
  - "Search [YouTube logo] YouTube captions and jump straight to the moment.";
  - a search form at most 620px wide: a 44px input with the placeholder "Search
    a word or phrase…", the accent button inside it, and a primary "Search"
    button;
  - "Try" links to `/say/schedule`, `/say/water` and `/say/either`.
- **How it works:** three cards numbered 01–03 with the design's copy.
- **The footer:** "© 2026 saythis.co".
- **On phones,** the hero type shrinks and the Search button may become an icon.

### States

- **A search in flight:** client-side navigation to a new search shows a
  skeleton in the layout's shape while the server renders.
- **No clips:** "No clips for “{query}”" with the Try links, and noindex.
- **Search unavailable:** the 500 error page reads "Search is unavailable right
  now" with Retry. The header search stays usable.
- **A path longer than 200 characters once read back:** a short message, no API
  call, and noindex.

### Lint, typecheck and deploy

- **Biome:** its file list gains the frontend. lint-staged covers `ts`, `tsx`,
  `js`, `json` and `css`. If Biome can't parse Tailwind v4's CSS directives,
  CSS stays out of lint-staged.
- **Typecheck:** the pre-commit hook adds the frontend's own `tsc --noEmit`. The
  root tsconfig already excludes the frontend.
- **The Dockerfile keeps its location and shape:** built from the repo root,
  copying the contract in, standalone server on port 3000. Dokploy's settings
  don't change.
- **New runtime env vars** on the frontend Application: `API_URL`
  (`http://api:3001`) and `PUBLIC_ORIGIN` (`https://saythis.co`).

## Testing Decisions

- **No automated frontend tests in this effort.** Eugene decided to skip tests
  for now. The pre-commit hook gains lint and typecheck for the frontend, but no
  test runner.
- **The slug rule** is checked during implementation with a one-off script over
  the prototype's cases: every case round-trips and is idempotent.
- **Manual checks per issue,** in a browser against the local API:
  - the server HTML holds the first clips, the title, the canonical URL and
    noindex where it applies;
  - a non-canonical slug finds the same clips and names the canonical URL;
  - the three layouts at 390, 768 (portrait) and 1440 widths, plus a phone held
    sideways;
  - autoplay from inside the app and on a direct visit;
  - loop, seeking, speed and keyboard;
  - sign-in, sign-out and deletion;
  - both themes with no flash.
- **Real devices:** an iPhone and an Android phone, for scripted playback before
  the first tap.
- **What makes a good test later:** drive the app through what a listener
  touches, and assert on what they see: rendered text, the URL, what the player
  was told to play. Don't assert on hooks or internal state.
- **The planned test suite, as a follow-up:**
  - Vitest with Testing Library, MSW and a fake player behind our YouTube hook,
    covering the slug, highlighting, the caption window, the loop and seek rules
    as a pure function, deduplication, the metadata builders, and the page's
    states;
  - Playwright against a fixture API on port 3001, run on demand like
    `test:net`, covering the server HTML, canonical links, a play-through and the
    three layouts.
- **Prior art:** none for the frontend. The backend uses `node:test` with
  `node:assert/strict`.

## Out of Scope

- **Automated frontend tests** (see Testing Decisions).
- **Extra content on search pages:** Related searches, About “{phrase}” with
  IPA, Common phrases. They're parked in
  `.scratch/parked/004-phrase-page-content-beyond-clips.md`.
- **Parts of the design left out:** Word of the day, Trending and Compare on
  home, the Docs and API header links, the footer links, word-by-word progress
  in the caption, and the design's other list layouts (list below, grid,
  transcript, mini player, strip).
- **Real accent data:** an accent filter in the API, per-accent counts, and the
  accent in the H1 and title.
- **A sitemap.** It waits for a list of phrases.
- **A stable `?clip=<captionId>` link** to a single clip.
- **Redirects:** neither old `/{query}` URLs nor non-canonical slugs are
  redirected, because Google hasn't crawled the site yet. If a URL scheme ever
  changes after indexing, permanent (308) redirects come back.
- **Showing the most common casing** of the query, instead of lowercase.
- **Folding `’` and `'`** in the captions index (a `char_filter` and a reindex).
- **A preview deploy** on another domain.
- **A lightweight YouTube facade** for faster first load.
- **Muted autoplay.**
- **Analytics and error tracking.**

## Further Notes

- **The design files** sit in the design folder next to this spec:
  - desktop: home, and search with the side queue;
  - mobile: use variant 2a, "Sticky, released at the end of the list";
  - tablet: 3a for portrait, 3c for landscape. The file's own suggested rule is
    the one used above.

  They are self-extracting Claude Design bundles. Open them in a browser to see
  them, or run the unpack script next to them to get the markup and the
  design's mock logic. Their sample clips, counts and text are mock data.
- **Before deploying,** confirm the frontend can reach the API inside Dokploy.
  This should print JSON:
  `docker run --rm --network dokploy-network curlimages/curl -s "http://api:3001/api/search?q=hello&limit=1"`.
- **Rollback** is redeploying the previous commit in Dokploy.
- **Docs:** ADR-0011 records server rendering, `API_URL` and the hour-long
  cache. ADR-0012 records the URL and slug rule. ADR-0008's note on relative
  `/api` paths now applies to the browser only. `CONTEXT.md` defines Search,
  Clip, Caption, Play-from point and Channel name. "Accent" is not a glossary
  term yet, because it doesn't exist in the data.
- **next-themes was rejected** for the theme. Its last release was in March
  2025, and on Next.js 16.2+ it logs a dev-time "Encountered a script tag"
  warning (next-themes issue #387).
