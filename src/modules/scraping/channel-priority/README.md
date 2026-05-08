# Channel Priority

Each channel gets a numeric priority score that controls scraping order. Higher score = processed first across all three job queues (`channelJobs`, `videoDiscoveryJobs`, `videoJobs`).

Two scores are stored per channel:

- **`scrapingScore`** — used to order scraping jobs. Includes all factors below.
- **`searchScore`** — reserved for future search result boosting. Includes only subs, duration, and views (no caption quality, similarity, or manual boost).

## Score factors

| Factor | Weight | Notes |
|---|---|---|
| Caption quality | up to +30 / −150 penalty | Gated: only active after 100 processed videos |
| Subscriber count | up to +10 | Log-normalized, cap at 1M |
| Avg video duration | up to +10 | Log-normalized, cap at 1800s |
| Avg view count | up to +10 | Log-normalized, cap at 100k |
| Avg caption similarity | up to +10 | Linear 0–1 |
| Manual boost | +500 | Set via `/push_channel` Telegram command |

### Caption quality gate

Only applies once a channel has ≥ 100 processed videos.

- Caption rate ≤ 10% → **−150 penalty** (channel is likely not in English or has no captions)
- Caption rate > 10% → **0–30 bonus**, scaled linearly from the threshold to 100%

### Log normalization

Subs, duration, and views use `log10(value + 1) / log10(cap + 1)`, clamped to [0, 1]. This compresses large ranges so that e.g. 100k subs vs 1M subs is a smaller gap than 0 vs 100k.

## When scores are recalculated

`ChannelPriorityScheduler` runs every 5 minutes and recalculates up to 100 channels whose `lastVideoProcessedAt > calculatedAt` — i.e. channels that had a video processed since the last score calculation.

`lastVideoProcessedAt` is updated by `VideoEntriesWorker` after each successfully processed video.

When a score is recalculated, all PENDING jobs for that channel across all three queues are updated immediately.

## Manual boost (`/push_channel`)

Adds the channel to `boostedChannels` and triggers an immediate recalculation. The +500 boost is permanent (no expiry) and dominates all other factors, ensuring the channel rises to the top of every queue.
