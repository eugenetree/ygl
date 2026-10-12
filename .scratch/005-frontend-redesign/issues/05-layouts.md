# 05 — Desktop, tablet and phone layouts

**What to build:** The search page takes the designed layout for the screen.
- **Desktop and landscape tablets:** the clip list sits beside a pinned player
  column, sized so the title, video, controls and caption fit the window.
- **Phones and portrait tablets:** the video, controls and caption card pin to
  the top while the list scrolls underneath, and let go when the list ends.

Rotating a tablet rearranges the page without reloading the video.

The designs are in this folder's design directory:
- desktop, with the side queue;
- mobile, variant 2a;
- tablet, with 3a for portrait and 3c for landscape.

**Blocked by:** 03 — Play clips, 04 — The caption card follows the speech

**Status:** resolved

- [ ] One page structure serves every layout, and CSS alone switches between them. Resizing or rotating while a clip plays keeps it playing: the iframe isn't remounted.
- [ ] **Side list** (at least 960px wide and wider than tall):
  - two columns: the player column, and the list at 300–360px;
  - the page at most 1280px wide.
- [ ] In the side list, the player column (title row, video, control bar, caption card) is pinned, and the list scrolls with the page, not inside a box of its own.
- [ ] The video's width is at most (window height − 380px) × 16/9 and at least 472px, so the player column fits the window.
- [ ] The side-list header is the design's sticky 56px results header with a blurred background:
  - the logo;
  - the search form, at most 520px, with ⌕ and a `/` hint;
  - room at the right for the accent button (08), the theme toggle (09) and sign-in (10).
- [ ] The H1 and the count line sit at the top of the list column.
- [ ] **Sticky player** (narrower than 960px, or taller than wide):
  - the header scrolls away;
  - the pinned block holds the full-width video, the progress bar, the control bar and the caption card;
  - there's no title row.
- [ ] **The tablet header:**
  - the logo;
  - a search box at most 440px, with room inside it for the accent name (08);
  - "{n} / {total}" on the right.
- [ ] **The phone header:** the logo and a search box with room inside it for the accent code chip (08).
- [ ] In both, room is left for icon-sized theme (09) and sign-in (10) controls.
- [ ] **The touch control bar** has 44px buttons:
  - ←, Play/Pause (primary), → and a "↻ Loop" toggle;
  - the time on the right, and on phones also "{n}/{total}".

  At 360px the Loop label shrinks to its icon and the row still fits.
- [ ] The caption card's main line is 24px on tablets and 20px on phones. The lines around it are 14px and 13px.
- [ ] The H1, the count line and the list follow the pinned block, in one column on phones and two from about 640px wide.
- [ ] The pinned block lets go when the list ends, and the footer reads normally below.
- [ ] **Short screens** (under 500px tall, such as a phone held sideways): the player isn't pinned.
- [ ] Checked at 360×740, 390×844, 768×1024, 1024×768, 1440×900 and 844×390.
