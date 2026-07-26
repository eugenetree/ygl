# External Integrations

**Analysis Date:** 2026-07-26

## APIs & External Services

**YouTube:**
- youtube-search-api 1.2.2 - Search for channels on YouTube
- yt-dlp (external binary) - Download video metadata, captions, audio, formats
  - SDK/Client: ytdlp-nodejs 3.4.2
  - Execution: Spawned as child process with environment configuration

**Telegram:**
- Telegraf 4.16.3 - Bot framework for command interface and notifications
  - Auth: `TELEGRAM_BOT_TOKEN` environment variable
  - Chat ID: `TELEGRAM_CHAT_ID` environment variable
  - Used for: Admin commands, scraper status notifications, control/lifecycle management

## Data Storage

**Databases:**
- PostgreSQL 18 (Alpine)
  - Connection: `postgres://admin@db:5432/saythis`
  - Client: pg 8.12.0 + Kysely 0.27.5 ORM
  - Environment variables: `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `DB_HOST`, `DB_PORT`
  - Tables: channels, videos, captions, channel_discovery_jobs, video_jobs, search_channel_queries, channel_priority_scores, and more

**Full-Text Search:**
- Elasticsearch 8.12.0
  - Connection: `http://elasticsearch:9200` (default, via `ES_NODE` env var)
  - Client: @elastic/elasticsearch 8.12.0
  - Index: "captions" - Full-text search over video captions
  - Security: xpack.security disabled in development

**File Storage:**
- Local filesystem only
  - Logs: `logs/` directory
  - Fixtures: `src/fixtures/` for test data
  - Channel discovery data: `src/modules/scraping/scrapers/channel-discovery/data/`

**Caching:**
- None detected (global state managed in-memory for HTTP request throttling)

## Authentication & Identity

**Telegram Authentication:**
- Custom implementation using chat ID verification
- Auth method: `TELEGRAM_CHAT_ID` validation in middleware
- Implementation: `src/modules/telegram/telegram-bot.ts` - setupAuthMiddleware()

**YouTube Authentication:**
- Public API (youtube-search-api) - No authentication required
- yt-dlp cookies: Optional `YTDLP_COOKIES_B64` environment variable for authenticated access
  - Used when YouTube restricts unauthenticated access

**API Access Control:**
- None implemented (API server at `src/modules/api/api-server.ts` has CORS enabled for all origins)

## Monitoring & Observability

**Error Tracking:**
- None (no external service)
- Local logging only to file system

**Logs:**
- File-based logging via custom Logger class (`src/modules/_common/logger/logger.ts`)
  - Logs written to `logs/` directory
  - Timestamp, context, and category per log entry
  - Console output and file persistence

**Metrics:**
- None detected

## CI/CD & Deployment

**Hosting:**
- Docker Compose based (local/on-premise deployment)
- No cloud provider integration detected

**CI Pipeline:**
- None detected (no GitHub Actions, GitLab CI, or equivalent)

**Docker Services:**
- bot - Telegram bot command interface
- api - REST API search endpoint (port 3001)
- sync-elastic - Elasticsearch caption index synchronization
- scraper - YouTube scraper with VPN support (special image with OpenVPN)
- db - PostgreSQL database
- elasticsearch - Search backend
- kibana - Elasticsearch UI (port 5601)

## Environment Configuration

**Required Environment Variables:**

Database:
- `POSTGRES_USER` - Database user (default: "admin")
- `POSTGRES_PASSWORD` - Database password (default: "admin")
- `POSTGRES_DB` - Database name (default: "saythis")
- `DB_HOST` - Database hostname (default: "db" in Docker)
- `DB_PORT` - Database port (default: 5432)

Elasticsearch:
- `ES_NODE` - Elasticsearch endpoint (default: "http://elasticsearch:9200")

Telegram:
- `TELEGRAM_BOT_TOKEN` - Bot API token (required)
- `TELEGRAM_CHAT_ID` - Admin chat ID for commands/notifications (required)
- `TELEGRAM_NOTIFICATION_ERROR` - Error notification setting (optional)

API:
- `IS_API_ENABLED` - Enable REST API server (optional, defaults to disabled)

Scraper (YouTube):
- `YTDLP_COOKIES_B64` - Base64-encoded yt-dlp cookies for authenticated access (optional)

VPN Scraper:
- `VPN_USER` - VPN username
- `VPN_PASS` - VPN password
- `VPN_CONFIG_B64` - Base64-encoded OpenVPN configuration file

**Secrets Location:**
- `.env` files (repository root and per-instance: `.env.us`, `.env.gb`)
- Not committed to git (ignored)
- Example provided in `.env.example`

## Webhooks & Callbacks

**Incoming:**
- None detected

**Outgoing:**
- Telegram notifications sent via Telegraf to configured chat ID
- Elasticsearch events (index syncs) are internal to application

## API Endpoints

**Internal REST API:**
- Endpoint: `GET /api/search?q=<query>`
- Port: 3001 (localhost)
- CORS: Enabled for all origins
- Response: JSON with caption search results
  - Fields: videoId, startTime, text
  - Source: Elasticsearch "captions" index

## Rate Limiting & Throttling

**HTTP Requests:**
- Global request queue in `HttpClient` (`src/modules/_common/http/index.ts`)
  - Configurable cooldown: 5-10 seconds (5000 + random 0-5000ms)
  - Sequential processing (no parallel requests)

**YouTube Scraping:**
- Per-request throttling via HttpClient
- Additional VPN rotation for geo-bypassing

---

*Integration audit: 2026-07-26*
