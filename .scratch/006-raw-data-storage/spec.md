# Spec: Keep the raw video info and raw caption tracks of every fetch in R2

Status: ready-for-agent

Related: `docs/adr/0014-raw-data-in-its-own-r2-bucket.md` (the storage decision
this spec implements), `CONTEXT.md` (Raw data section)

## Problem Statement

When the scraper fetches a video, it parses YouTube's caption tracks into
captions and keeps only the parsed captions. The json3 files yt-dlp downloaded
are deleted as soon as they are parsed, and the full yt-dlp output survives
only 14 days in the response recorder on the server's disk.

So when a parsing or selection mistake is found later, the only way to fix the
affected videos is to fetch them again from YouTube, and what YouTube serves now
may no longer be what was parsed then. This has already happened: auto captions
were stored the wrong way, and there was no raw version to reprocess from.

The same gap hides why past decisions were made. For `paUibKBGJNs`, yt-dlp
listed two manual English tracks (CC1 and DTVCC1). The CC1 broadcast track was
stored, and nothing records that the other existed or which one was picked.

## Solution

Every time the scraper fetches a video, it keeps that video's **raw video info**
(everything yt-dlp reported, or the error it gave) in a dedicated R2 bucket,
whether the video ends up saved, skipped or failed. When it downloads both the
auto and the manual caption track, it also keeps both **raw caption tracks**,
each with the track key it picked.

The raw data is kept forever, one copy per video, and a later fetch of the same
video overwrites it. If the raw data can't be stored, the fetch is a Failure.
The job is marked failed, the worker stops and the alert fires, so every video
saved from now on is guaranteed to have its raw data.

## User Stories

1. As the maintainer, I want the raw caption tracks of every video whose auto and manual tracks were both fetched to be kept, so that I can re-parse them after fixing a parsing bug without fetching from YouTube again.
2. As the maintainer, I want the raw video info of every fetched video to be kept, so that I can re-run decisions such as the video language or the choice of manual track against exactly what yt-dlp reported.
3. As the maintainer, I want raw video info kept for Skips, so that I can check later whether a video was really members-only, age-restricted or removed, or whether we misread yt-dlp's error.
4. As the maintainer, I want raw video info kept for Failures, including yt-dlp's error and stderr when there was no JSON, so that a failure can be investigated after the 14-day recorder has dropped it.
5. As the maintainer, I want the raw video info to be the full, untrimmed yt-dlp output, so that a field I didn't know I would need (like a track's `name`) is never lost to trimming.
6. As the maintainer, I want each raw caption track to record the track key that was picked (e.g. `en-orig`, or the opaque `en-uYU-mmqFLq8`), so that I can tell which of the listed tracks a video's captions came from.
7. As the maintainer, I want every raw object to record when it was fetched, so that I can tell whether it predates a yt-dlp change or a YouTube change.
8. As the maintainer, I want the raw video info and raw caption tracks of one fetch to share the same fetch time, so that I can tell they belong together.
9. As the maintainer, I want each raw object to describe itself (video id, fetch time, track key) inside its own content, so that nothing is lost when I bulk-download the bucket for a rerun.
10. As the maintainer, I want the raw data for a video to sit under a key derived from its video id, so that I can find any video's raw data without a lookup table.
11. As the maintainer, I want one copy per video, overwritten by a later fetch, so that reprocessing never has to choose between copies.
12. As the maintainer, I want the scraper to treat a failed upload as a Failure, so that a saved video without raw data can't happen silently.
13. As the maintainer, I want the upload to happen before the video is written to the database, so that a video only reaches the database once its raw data is safe.
14. As the maintainer, I want a failed upload to fire the same Scraper failure alert as any other Failure, so that an R2 outage doesn't go unnoticed.
15. As the maintainer, I want a failed upload during a Skip to turn into a Failure, so that the rule that R2 failures are fatal has no exceptions.
16. As the maintainer, I want the scraper to refuse to start in production when R2 isn't configured, so that a missing variable in Dokploy can't quietly turn storage off.
17. As a developer, I want the scraper to run locally without R2 credentials and log once at startup that raw data storage is off, so that working on the scraper doesn't require a bucket.
18. As a developer, I want to point my local scraper at a dev bucket, so that I can see the raw data it writes before deploying.
19. As the maintainer, I want raw data in its own bucket with a token scoped to that bucket, so that the scraper's credentials can never overwrite or delete the database backups.
20. As the maintainer, I want raw data kept forever with no lifecycle rule, so that a bug found months later can still be fixed from data fetched months ago.
21. As the maintainer, I want raw data to stay out of Postgres, so that the database and the dumps I restore locally don't grow by gigabytes of data the app never reads.
22. As the maintainer, I want raw caption tracks stored only for videos whose auto and manual tracks were both fetched, so that we don't spend extra yt-dlp requests downloading tracks we would never use.
23. As the maintainer, I want the 14-day recorder to keep working unchanged while this rolls out, so that I don't lose my on-server diagnostics before the R2 path has proven itself.
24. As the maintainer, I want the storage behaviour documented on the fetch itself, so that a future reader knows that getting a video also stores its raw data and can fail because of it.

## Implementation Decisions

- **Where raw data is captured.** The YouTube video fetch (`YoutubeApiGetVideo.getVideo`) stores the raw data itself, through an injected **raw data store**, the same way it already uses the response recorder. It stores the raw video info right after the yt-dlp metadata call, before any branch can return. It stores the raw caption tracks right after both json3 files are downloaded and before they are deleted. Because the fetch returns before the video is written to the database, "upload before insert" holds without the consumer doing anything. Rejected: returning the raw data to the consumer and letting it write. Every one of the fetch's exits, Failures included, would have to carry the raw data out, and the codebase's `Result` errors carry no payload.
- **Fetch contract.** The fetch's error union gains a raw-data storage error. Its documentation says it stores the fetch's raw data before returning, and that a storage failure is returned as a Failure. The video worker treats that error like any other non-skip error: the job is marked failed, the worker stops and the alert fires.
- **Raw data store interface.** A small interface in the youtube-api module: one operation to store a video's raw video info, and one to store a raw caption track of a given kind (auto or manual). Each takes the video id, the fetch time and the content, and the track operation also takes the track key. It returns a `Result`. The R2 implementation and a disabled implementation (used when storage is off) sit behind it. The disabled one succeeds without writing.
- **Object layout** (the decision itself, from the design session):

  ```
  <videoId>/video-info.json.gz    → { videoId, fetchedAt, result }
  <videoId>/auto-track.json.gz    → { videoId, fetchedAt, trackKey, track }
  <videoId>/manual-track.json.gz  → { videoId, fetchedAt, trackKey, track }
  ```

  `result` is the same `{ ok: true, value } | { ok: false, error }` shape the response recorder writes, and `track` is the parsed json3. Everything is gzipped JSON. There's no prefix, because the bucket holds nothing else. One fetch uses a single `fetchedAt` across all its objects.
- **R2 access.** It uses an S3-compatible client library, new to the scraper, against R2's S3 endpoint. The bucket is separate from the database backup bucket, and its token is scoped to *Object Read & Write* on that bucket only. The scraper never deletes objects.
- **Configuration.** New scraper variables: the R2 endpoint, access key id, secret access key and bucket name for raw data, added to the scraper's compose environment and to `.env.example`. When `APP_ENV=production` and any of them is missing, the scraper refuses to start with an error naming the missing variables. Otherwise a missing variable means the disabled store, and the scraper logs once at startup that raw data storage is off. The rule lives in the one function that builds the store from the environment.
- **Scope of caption tracks.** Raw caption tracks are stored exactly when the fetch downloads both tracks today: an English video with both an auto track in its video language and a manual track. No new yt-dlp requests are added.
- **Unchanged.** The caption parsing, the database schema and the reprocessing pipeline stay as they are.
- **Retiring the response recorder.** It keeps running unchanged until R2 has run in prod for a week or two. Then a last step removes it and its volume, and points the prod skill's "what did yt-dlp return for this video" workflow at the R2 bucket.
- **Deploy prerequisites.** Create the bucket and its scoped token, put the variables in Dokploy, and set `APP_ENV=production` for the scraper. Today prod may leave `APP_ENV` unset, and then the startup check never runs.

## Testing Decisions

- **What a good test is here:** it drives the fetch from the outside, using fake yt-dlp outputs and a fake raw data store, and asserts what the fetch returned and what ended up in the store. It does not assert how the store is called internally, such as call order beyond "before returning" or argument plumbing.
- **Main seam: the YouTube video fetch**, with the existing mock yt-dlp client and an in-memory fake raw data store. Cases:
  - Raw video info is stored for a saved video, a Skip (yt-dlp error) and a Failure (e.g. schema validation, ambiguous video language, Premium-only).
  - Both raw caption tracks are stored, with the picked track keys and the same fetch time as the raw video info, when both tracks are downloaded.
  - No raw caption tracks are stored when only one kind exists, or when the video isn't English.
  - A failing store turns a would-be success into a Failure, and turns a would-be Skip into a Failure.
  - Prior art: the existing YouTube video fetch tests and their mock yt-dlp client.
- **R2 implementation:** a network test, part of the existing `test:net` group and not run by `npm test`. It writes and reads back an object in a dev bucket, and is skipped when the R2 variables aren't set. Prior art: the existing yt-dlp client and video fetch network tests.
- **Configuration rule:** a unit test of the function that builds the store from the environment. It covers production with everything set, production with a variable missing (refuses), development with nothing set (disabled store), and development fully set (R2 store).
- **Video worker:** no new tests. The storage error is a non-skip error, which the worker already treats as a Failure.

## Out of Scope

- Backfilling raw data for videos saved before this ships (57,657 have both tracks). A separate later job.
- A queryable list of caption tracks in Postgres (parked question 006 in `bugfix/auto-captions`). It can later be filled from the raw video info.
- Stale raw caption tracks: a track object from an earlier fetch that survives a refetch which no longer produced it. Accepted for now.
- Reprocessing from raw caption tracks instead of the `captions` table.
- The auto-caption end-time bug in caption parsing, which is tracked separately.
- Comments (parked as `.scratch/parked/006-store-youtube-comments-via-ytdlp.md`).
- Downloading caption tracks for non-English or auto-only videos.

## Further Notes

- Expected volume: ~640 fetches a day while the scraper runs, ~26 KB of raw video info per video and ~2–2.5 KB of raw caption tracks per minute of video, all gzipped. About 6 GB a year, within or near R2's free tier.
- The raw video info contains signed URLs with the server's IP and session parameters, so the bucket must stay private.
- The scraper hasn't recorded a fetch since 2026-10-17. Confirm it's running before judging the rollout by what appears in the bucket.
