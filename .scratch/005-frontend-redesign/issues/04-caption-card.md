# 04 — The caption card follows the speech

**What to build:** Under the player, a caption card shows three lines:
- the line before, faint;
- the line being spoken, large, with query words highlighted;
- the line after, faint.

During the lead-in before a clip's caption starts, the middle row already shows
the clip's line. With Loop off, once the clip's line ends, the card rolls forward
line by line as the video plays, highlighting query words wherever they appear.

**Blocked by:** 03 — Play clips

**Status:** resolved

- [ ] When a clip becomes current, its video's captions are fetched from the API's video captions route and cached per video, so returning to the video doesn't refetch.
- [ ] The middle row is the caption being spoken at the current time.
  - Before the clip's caption starts (the lead-in from the play-from point), it shows the clip's own caption.
- [ ] Past the clip with Loop off, the card follows whichever caption is being spoken, with the ones before and after around it.
- [ ] Query words are highlighted in every row it shows, with the same segmentation as the list. The match gets the yellow mark with its inset mark-line underline.
- [ ] Until the captions arrive, or if fetching them fails, the card shows only the clip's own line, with no error.
- [ ] The card keeps a stable height, so switching lines or clips doesn't shift the layout below it.
- [ ] Sizes follow the design: the main line is 24px, weight 500, -0.015em, line height 1.35, and the lines around it are 15px. Ticket 05 sets the tablet and phone sizes.
