# 07 — Speed and keyboard shortcuts

**What to build:** A listener can slow a clip to 0.75× or 0.5× from the control
bar or with S, and the speed sticks across clips and visits. Every playback
control has a key. On desktop, a row of hints under the player teaches the keys.

**Blocked by:** 05 — Desktop, tablet and phone layouts

**Status:** resolved

- [ ] A speed control with 0.5×, 0.75× and 1× is in both control bars:
  - in the side-list bar, after the Loop switch and before the time;
  - in the touch bar, as a button that cycles through them.
- [ ] The speed carries over to the next clip and is stored in localStorage.
- [ ] Changing speed from YouTube's own menu updates our control.
- [ ] The keys:
  - `/` focuses the search box;
  - Space or K plays and pauses, without scrolling the page;
  - → or N goes to the next clip, ← or P to the previous one;
  - L toggles loop;
  - R replays from the play-from point;
  - S cycles speed.
- [ ] The keys are ignored while focus is in an input or textarea. While the YouTube iframe has focus, its own keys apply.
- [ ] Esc only closes menus and dialogs. It never leaves the page.
- [ ] The shortcuts row shows Space Play/pause, ← → Prev/next, L Loop, R Replay and S Speed, in the design's kbd style.
  - It appears only in the side-list layout, and never on touch devices.
  - Ticket 08 adds 1–5 Accent.
