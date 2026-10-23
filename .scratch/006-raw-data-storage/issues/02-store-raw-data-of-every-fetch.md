# 02 — Store the raw data of every fetch in R2

**What to build:** every time the scraper fetches a video, it stores that video's raw video info in the raw data bucket, whether the video is saved, skipped or failed. When it downloads both caption tracks, it also stores both raw caption tracks with the track keys it picked. If storing fails, the fetch is a Failure: the job is marked failed, the worker stops and the alert fires. Production refuses to start without R2 configured, and development runs with storage off. Full design: `.scratch/006-raw-data-storage/spec.md`. Decision: `docs/adr/0014-raw-data-in-its-own-r2-bucket.md`.

**Blocked by:** None for building. Running the network test, the local demo and the deploy need 01.

**Status:** ready-for-agent

- [ ] `<videoId>/video-info.json.gz` holds `{ videoId, fetchedAt, result }` for saved, skipped and failed fetches, with the full untrimmed yt-dlp output or its error
- [ ] `<videoId>/auto-track.json.gz` and `<videoId>/manual-track.json.gz` hold `{ videoId, fetchedAt, trackKey, track }` when both tracks were downloaded, and nothing is written for them otherwise
- [ ] All objects of one fetch share one `fetchedAt`, and a later fetch overwrites the earlier one
- [ ] The video fetch stores through an injected raw data store before returning, and its documentation says so
- [ ] A storage failure turns any outcome, a would-be Skip included, into a Failure, so the video is never written to the database without its raw data
- [ ] With `APP_ENV=production` and any raw data variable missing, the scraper refuses to start and names the missing variables. Otherwise it logs once that raw data storage is off and scrapes normally
- [ ] The new variables are in the scraper's compose environment and in `.env.example`
- [ ] Video fetch tests with a fake raw data store cover the cases listed in the spec's Testing Decisions
- [ ] A unit test covers the configuration rule, and a `test:net` test writes and reads back an object in the dev bucket (skipped when unconfigured)
- [ ] Running the scraper locally against the dev bucket produces the objects above
- [ ] The response recorder still works unchanged
