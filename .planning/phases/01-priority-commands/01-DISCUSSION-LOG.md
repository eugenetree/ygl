# Phase 1: Priority Commands - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-26
**Phase:** 1-Priority Commands
**Areas discussed:** Processed/total definition, Channels with no score, Use case structure, Message format

---

## Processed/total definition

| Option | Description | Selected |
|--------|-------------|----------|
| SUCCEEDED only | Videos fully processed and captions extracted | ✓ |
| SUCCEEDED + SKIPPED + FAILED | Everything touched, including skipped and failed | |
| SUCCEEDED + SKIPPED | Final resolutions, excludes failed/retryable | |

**User's choice:** SUCCEEDED only (processed); All job records (total)

**Notes:** Total = all videoJobs records (PENDING + PROCESSING + SUCCEEDED + FAILED + SKIPPED). Matches "full scope of work for this channel" framing.

---

## Channels with no score

| Option | Description | Selected |
|--------|-------------|----------|
| Exclude them | Only show channels with a calculated priority score | ✓ |
| Show with score 0 | Include all channels, unscored = lowest priority | |
| Show with score 0, at bottom | Force unscored below scored | |

**User's choice:** Exclude them — unscored channels haven't been prioritized, showing 0 would be misleading.

---

## Use case structure

| Option | Description | Selected |
|--------|-------------|----------|
| One shared use case + two controllers | GetChannelPriorityRankingsUseCase with filter param | ✓ |
| Two separate use cases + two controllers | One use case per command | |
| You decide | Defer to Claude | |

**User's choice:** One shared use case with `all` | `active` filter parameter.

---

## Message format

| Option | Description | Selected |
|--------|-------------|----------|
| Plain compact: rank. Name \| score \| X/Y | `1. MrBeast \| 94.2 \| 312/450` | ✓ |
| Emoji-decorated: two lines per entry | `1. 📺 MrBeast\n   Score: 94.2 \| 312/450 videos` | |
| You decide | Defer to Claude | |

**Score precision:** 1 decimal (e.g. 94.2) — selected by user.

---

## Claude's Discretion

- Priority score source: pre-calculated `channelPriorityScores` table (no recalculation)
- "Active" filter: EXISTS subquery on videoJobs.status = 'PENDING'
- Limit: top 10, ordered by scrapingScore DESC
- Command names: `/priority_all` and `/priority_active` (underscore, Telegram convention)

## Deferred Ideas

None.
