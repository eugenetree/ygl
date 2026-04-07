# External Integrations

**Analysis Date:** 2026-04-07

## APIs & External Services

**YouTube (unofficial scraping - no official API key):**
- YouTube web scraping - channel discovery, channel info, video listings, captions
  - HTTP client: `src/modules/_common/http/index.ts` (Axios-based with request queuing and 5s cooldown)
  - Endpoints scraped: `youtube.com/results`, `youtube.com/channel/{id}/videos`, `youtube.com/watch?v=`, `youtube.com/youtubei/v1/search`
  - HTML parsing: extractors in `src/modules/youtube-api/extractors/`
  - Auth: None (unauthenticated, browser-like User-Agent headers)

**yt-dlp (local binary):**
- Video metadata extraction, caption fetching, audio metadata
  - SDK/Client: `ytdlp-nodejs` npm package wrapping local `yt-dlp` binary
  - Client: `src/modules/youtube-api/yt-dlp-client.ts`
  - Binary: installed to `/usr/local/bin/yt-dlp` in Docker image
  - Auth: None (inherits any cookies or cookies file if configured via args)

**Telegram Bot API:**
- Bot interface for operator commands (scraper control, stats, config)
  - SDK/Client: `telegraf` npm package
  - Client: `src/modules/telegram/telegram-bot.ts`
  - Auth: `TELEGRAM_BOT_TOKEN` env var; access restricted to `TELEGRAM_CHAT_ID`
  - Transport: Long polling (not webhooks)
  - Controllers: `src/modules/scraping/telegram/config.controller.ts`, `lifecycle.controller.ts`, `stats.controller.ts`

## Data Storage

**Databases:**
- PostgreSQL 18 (Alpine)
  - Connection env vars: `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `DB_HOST`, `DB_PORT`
  - Client: Kysely 0.27 query builder with `pg` driver, `CamelCasePlugin` enabled
  - Client file: `src/db/client.ts`
  - Pool: max 10 connections
  - Schema types: `src/db/types.ts`
  - Tables: `channels`, `videos`, `captions`, `channelEntries`, `videoEntries`, `searchChannelQueries`, `channelVideosScrapeMetadata`, `elasticCaptionsSync`, `channelDiscoveryJobs`, `channelJobs`, `videoDiscoveryJobs`, `videoJobs`, `transcriptionJobs`, `channelVideosHealth`, `scraperConfig`
  - Migrations: hand-written TypeScript migration files in `src/db/migrations/` run via `src/db/scripts/run-migrations.ts`

**Search Index:**
- Elasticsearch 8.12 (single-node, no security)
  - Connection env var: `ES_NODE` (default: `http://elasticsearch:9200`)
  - Client: `@elastic/elasticsearch` npm package
  - Client file: `src/modules/captions-search/elastic-captions-sync.service.ts`
  - Index: `captions` with standard analyzer; fields: `id`, `video_id`, `type`, `start_time`, `end_time`, `duration`, `text`, `channel_id`, `channel_name`
  - Sync tracked in `elasticCaptionsSync` Postgres table

**File Storage:**
- Local filesystem only
  - Logs written to `logs/` directory by `src/modules/_common/logger/logger.ts`
  - `words_dictionary.json` at project root (English word dictionary, used for caption analysis)

**Caching:**
- None

## Authentication & Identity

**Auth Provider:**
- None (no user-facing auth; service is a backend scraper + Telegram bot)
- Telegram bot access is restricted to a single allowed chat ID via middleware in `src/modules/telegram/telegram-bot.ts`

## Monitoring & Observability

**Error Tracking:**
- None (no external error tracking service)

**Logs:**
- Custom file-based logger at `src/modules/_common/logger/logger.ts`
- Writes to `logs/{category}` files and `console.log`/`console.error`
- Log format: ISO timestamp + level + context + message

## CI/CD & Deployment

**Hosting:**
- Docker Compose (`docker-compose.yml`); runs as `saythis-app` container
- Dev: `Dockerfile.dev` (mounts source, runs `sleep infinity`, manual execution)
- Prod: `Dockerfile.prod` (multi-stage: tsc build then production image)

**CI Pipeline:**
- None detected

## Environment Configuration

**Required env vars:**
- `POSTGRES_USER` - PostgreSQL username
- `POSTGRES_PASSWORD` - PostgreSQL password
- `POSTGRES_DB` - PostgreSQL database name
- `DB_HOST` - PostgreSQL host
- `DB_PORT` - PostgreSQL port
- `ES_NODE` - Elasticsearch node URL (e.g., `http://elasticsearch:9200`)
- `TELEGRAM_BOT_TOKEN` - Telegraf bot token from BotFather
- `TELEGRAM_CHAT_ID` - Allowed Telegram chat ID for bot access

**Optional env vars:**
- `DOCKERFILE` - Which Dockerfile to use (default: `Dockerfile.dev`)
- `STOP_GRACE_PERIOD` - Docker stop grace period (default: `10m`)

**Secrets location:**
- `.env` file at project root (gitignored); `.env.example` documents all keys

## Webhooks & Callbacks

**Incoming:**
- None (Telegram bot uses long polling, not webhooks)

**Outgoing:**
- Telegram Bot API - notification messages sent via `src/modules/telegram/telegram-notifier.ts` on app start and scraper events

---

*Integration audit: 2026-04-07*
