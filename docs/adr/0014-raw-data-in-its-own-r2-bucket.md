# Raw data lives in its own R2 bucket, and a failed upload stops the scraper

The scraper keeps the raw video info of every video it fetches (saved, skipped
or failed) and, when it downloads both, the video's raw auto and manual caption
tracks. They go to a Cloudflare R2 bucket used for nothing else, one copy per
video, under `<videoId>/video-info.json.gz`, `<videoId>/auto-track.json.gz` and
`<videoId>/manual-track.json.gz`, kept forever. Each object is a gzipped JSON
wrapper carrying `videoId` and `fetchedAt`, and the track objects also carry the
`trackKey` we picked. An upload that fails is a Failure: it happens before the
video is written to the database, so the job is marked `FAILED`, the worker
stops and the alert fires. Outside `APP_ENV=production` the bucket is optional
and storage is off without it. In production the scraper refuses to start
without it.

## Why

Captions were parsed into the `captions` table and the downloaded json3 files
were thrown away, so a parsing mistake could only be fixed by fetching the
videos again. Raw data is written once, read whole by video id, and read only
by batch reprocessing. That is what object storage is for. At the scraper's
~640 fetches a day it is ~6 GB a year gzipped (~26 KB of video info per video,
~2–2.5 KB of tracks per minute of video). In Postgres that would sit on a disk
with 40 GB free and in every dump restored locally, for data the app never
queries. A bulk rerun costs one R2 read per video, inside R2's free monthly
reads, with no egress fees.

The upload is fatal because the point is a guarantee: every video saved after
this shipped has its raw data. A best-effort upload would leave gaps that look
the same as "never stored".

## Considered alternatives

- **A Postgres table**: one system, transactional with the video row, and
  queryable. Rejected for the growth and dump size above. A field worth
  querying (e.g. the list of caption tracks) can become a column later, filled
  from R2.
- **The DB backup bucket (`saythis`) with a prefix**: the scraper runs yt-dlp
  against arbitrary YouTube content. A token for a shared bucket could
  overwrite or delete database backups. The raw-data token is scoped to its
  own bucket.
- **Best-effort uploads, as `YtDlpResponseRecorder` does**: scraping never stops
  for R2. Rejected for the gaps above.
- **Trimming the yt-dlp output**: dropping signed URLs and per-format noise
  would roughly halve it, but the old schema's trimming already lost each
  track's `name` (CC1 vs DTVCC1), and the URL params carry meaning too.
- **Object metadata for `fetchedAt` and `trackKey`**: lost on
  `aws s3 sync`, which is how a bulk rerun would download the bucket.

## Consequences

- An R2 outage halts scraping until the failed jobs are reset to `PENDING`.
- One copy per video means a refetch overwrites the previous one. A track
  object from an earlier fetch can outlive a refetch that no longer produced
  it. Its `fetchedAt` then differs from `video-info.json.gz`'s.
- Videos saved before this shipped have no raw data until a backfill fetches
  them again, which captures YouTube's current tracks rather than the ones
  originally parsed.
- Production needs `APP_ENV=production` set, or the startup check never runs
  and storage is silently off.
- The signed URLs in the raw video info include the server's IP and session
  parameters, so the bucket must stay private.
