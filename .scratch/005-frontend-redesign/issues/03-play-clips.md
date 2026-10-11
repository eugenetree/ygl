# 03 — Play clips

**What to build:** On a search page, clip 1 starts playing on its own from its
play-from point, in a YouTube player with our control bar underneath:
- Previous, Play/Pause and Next;
- the "Loop caption" switch, on by default;
- the time in the video.

Above the video, the title row shows the video title and channel name, with
"{n} of {total}". A progress bar under the video shows how far through the clip
playback is. With Loop on, the clip repeats. Clicking a row in the list plays
that clip, and the playing row is marked.

This uses the side-list (desktop) look of the control bar. Ticket 05 adds the
touch layout.

**Blocked by:** 02 — The server renders a search page's clips

**Status:** ready-for-agent

- [ ] Our own hook wraps the YouTube IFrame API:
  - the API script loads once;
  - the player shows YouTube's own controls, with `rel=0` and `playsinline=1`.
  - It reports the player's state, its errors, blocked autoplay and rate changes.
  - It polls the current time about four times a second, because the API has no time-update event.
- [ ] A clip plays from its play-from point to its caption's end.
  - Switching to a clip from the same video seeks.
  - Switching to another video loads it.
- [ ] Every clip load tries to play with sound: page load, Previous, Next, a list row.
  - When the browser blocks autoplay, the clip waits paused at its play-from point, and Play starts it.
  - There is no muted autoplay.
- [ ] On a touch device, if pressing Play doesn't start playback within about a second, a hint shows: "Tap the video to start".
- [ ] Loop on: when playback crosses the caption's end from inside the clip, it jumps back to the play-from point.
  - Seeking out of the clip with YouTube's seek bar is respected.
  - Loop off lets the video play on.
- [ ] The 2px progress bar shows progress from the play-from point to the caption's end, and stays full past it.
- [ ] The time label shows the time in the video (m:ss, Geist Mono).
- [ ] The title row shows the video title, its channel name, and "{n} of {total}".
- [ ] Previous and Next move through the loaded clips and autoplay the new one.
  - Previous is disabled on clip 1.
  - Next is disabled on the last loaded clip. Ticket 06 extends it past 20.
- [ ] Activating a list row plays that clip. The playing row shows ▶ in the mark-line colour, the soft background and the yellow mark on its matched words.
- [ ] Previous, Next and list rows never change the URL or add history entries.
- [ ] A video that can't be played (removed, or embedding blocked) is skipped in the direction of travel, with the toast "Skipped a video that can't be played here".
