# Priority Channels Commands Design

**Date:** 2026-06-28

## Overview

Add two Telegram bot commands to display the top 10 channels ranked by scraping priority score:

- `/priority-all` — shows all channels regardless of processing state
- `/priority-active` — shows only channels that still have active work (at least one PENDING or PROCESSING video job)

## Commands & Display

Each command replies with a numbered list of up to 10 channels:

```
1. Channel Name — score: 8.45 | subs: 120k | videos: 45/120
2. Another Channel — score: 7.10 | subs: 890k | videos: 12/12
...
```

- **score** — `scrapingScore` from `channelPriorityScores`, rounded to 2 decimal places
- **subs** — `subscriberCount` from `channels`, formatted as human-readable (e.g. 120k, 1.2M)
- **videos** — `SUCCEEDED` video job count / total video job count for the channel

Channels with no entry in `channelPriorityScores` are excluded (unranked).

## Architecture

```
PriorityController
  → GetTopChannelsByPriorityUseCase
    → ChannelPriorityService.getTopChannels({ activeOnly: boolean })
```

### `/priority-active` filter

Channels are considered active if they have at least one `videoJobs` row with status `PENDING` or `PROCESSING`.

## Files

### New files

| File | Purpose |
|------|---------|
| `src/modules/telegram/priority.controller.ts` | Registers both commands, formats reply |
| `src/modules/scraping/channel-priority/get-top-channels-by-priority.use-case.ts` | Thin use case wrapper |

### Modified files

| File | Change |
|------|--------|
| `src/modules/scraping/channel-priority/channel-priority.service.ts` | Add `getTopChannels({ activeOnly: boolean })` method |
| `src/modules/telegram/telegram-bot.ts` | Register `PriorityController` |
| IoC container binding file | Bind `GetTopChannelsByPriorityUseCase` and `PriorityController` |

## Query Design

`ChannelPriorityService.getTopChannels()` runs a single query:

- Inner join `channels` + `channelPriorityScores` on `channelId`
- Left join `videoJobs` aggregated per channel: count of SUCCEEDED rows as `processedCount`, total count as `totalCount`
- ORDER BY `scrapingScore` DESC, LIMIT 10
- When `activeOnly: true`: add a filter requiring at least one `videoJobs` row with status `IN ('PENDING', 'PROCESSING')`

Return type: array of `{ name, scrapingScore, subscriberCount, processedCount, totalCount }`.

## No migrations needed

All required data is already in existing tables.
