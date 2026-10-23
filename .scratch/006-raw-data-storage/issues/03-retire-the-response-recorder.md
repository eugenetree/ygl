# 03 — Retire the 14-day response recorder

**What to build:** once raw data storage has run in prod for a week or two, the 14-day yt-dlp response recorder and its volume are removed, and the prod skill investigates "what did yt-dlp return for this video" by reading the raw video info from the raw data bucket instead of the server's disk. Spec: `.scratch/006-raw-data-storage/spec.md`.

**Blocked by:** 01, 02, and one to two weeks of 02 running in prod with raw video info appearing in the bucket.

**Status:** ready-for-agent

- [ ] The bucket holds raw video info for the prod fetches of that period (spot-check a saved video, a Skip and a Failure)
- [ ] The recorder, its `YTDLP_RAW_DIR` variable, its compose volume and its wiring are gone, and the video fetch no longer takes it
- [ ] The prod skill explains how to read a video's raw video info from the bucket (e.g. with the aws-cli container the Makefile already uses), without printing credentials
- [ ] The prod skill no longer refers to the on-server recorder directory
- [ ] Handing over to the user: removing the old volume's data on prod (the skill only observes)
