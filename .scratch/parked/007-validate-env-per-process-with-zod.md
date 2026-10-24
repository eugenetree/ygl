# Should every backend process (scraper, telegram bot, API) validate its environment once at startup with a zod config, the way `src/modules/api/api-config.ts` already does for the API, instead of reading `process.env` where each value is used?

**Parked:** 2026-10-24 · `feature/store-raw-data` @ `41996a7`
**Where:** `src/modules/api/api-config.ts`, `src/modules/youtube-api/raw-data-store.ts`, `src/db/client.ts`, `src/modules/scraping/lifecycle/scraper-command.listener.ts`, `src/modules/telegram/scraper-status-watcher.ts`, `src/modules/telegram/telegram-bot.ts`, `src/modules/telegram/telegram-notifier.ts`, `src/modules/captions-search/captions.service.ts`, `src/modules/scraping/scrapers/channel-discovery/search-channel-queries.seeder.ts`, `src/main-scraper.ts`, `docker-compose.yml`, `entrypoint.scraper.sh`

## Doubt

Env handling is inconsistent, and some of it fails late or silently:
- Only the API validates its env at boot (zod, `parseApiConfig`, every problem listed at once). The scraper and the bot rely on compose's `${VAR:?}` checks and scattered reads.
- `telegram-notifier.ts` falls back to `?? ""` for the token and chat id, so a missing value only shows when an alert is sent and Telegram rejects it. The scraper's failure alerts would quietly never arrive.
- `DB_*` / `POSTGRES_*` are read, unvalidated, in three files. `Number(process.env.DB_PORT)` is `NaN` when unset, and the error only appears at the first connection.
- `ES_NODE` has a hardcoded fallback in `captions.service.ts` and is also validated by `api-config.ts`, so it's read twice in two ways.
- `APP_ENV` means two things: the seeder treats anything except `"development"` (unset included) as prod, while the raw data store treats only `"production"` as prod.
- `RawDataStore` (`raw-data-store.ts`) added another hand-rolled check in its constructor rather than a zod schema.
- `entrypoint.scraper.sh` skips the VPN when any of `VPN_USER` / `VPN_PASS` / `VPN_CONFIG_B64` is missing, and the scraper then runs on the server's own IP, which ADR-0004 says YouTube's bot check rejects.

The user chose to keep env handling as it is for now and come back to it.

## Sanity check

**holds**: `grep process.env src` (non-test) shows the reads above: `db/client.ts:14-18`, `scraper-command.listener.ts:30-34`, `scraper-status-watcher.ts:29-33`, `telegram-notifier.ts:19-20`, `captions.service.ts:38`, `search-channel-queries.seeder.ts:57`, `telegram-bot.ts:33,50`. Only `main-api.ts:22` goes through a zod config; `RawDataStore`'s constructor reads `process.env` itself.

## Context

Options weighed in the session (none picked):
1. Keep per-feature hand-rolled checks (status quo).
2. A zod schema per feature, called from its factory (e.g. the raw data store's own schema).
3. **A zod config per process** (recommended): `parseScraperConfig`, `parseBotConfig`, next to `parseApiConfig`, built from shared fragments (DB, Telegram, raw data R2), parsed once in each `main-*.ts` and bound into DI the way `API_CONFIG` is. It would fix the silent Telegram default, the `NaN` port, the double `ES_NODE` read and give `APP_ENV` one meaning. The raw data rule (required only when `APP_ENV=production`) fits as a zod `superRefine`.
4. One global schema for every variable. Rejected in discussion: each process would demand variables it never uses (the scraper doesn't need `BETTER_AUTH_SECRET`).

Other facts a cold reader needs:
- Node never loads `.env` itself (no dotenv, no `--env-file`). Env comes from `docker-compose.yml` (required `${VAR:?}` for `POSTGRES_*` and `TELEGRAM_*`, optional `${VAR:-}` for the rest, `${YTDLP_POT_PROVIDER_URL-default}` where empty means off, and hardcoded `DB_HOST`, `DB_PORT`, `ES_NODE`, `YTDLP_RAW_DIR` in the shared `x-postgres-env` / `x-es-env` blocks) or from the Makefile (`include .env`, `guard-%`).
- Empty-means-off flags: `YTDLP_RAW_DIR`, `YTDLP_COOKIES_B64`, `YTDLP_POT_PROVIDER_URL`, `IS_API_ENABLED`.
- The frontend has its own pattern (`frontend/lib/api-url.ts`, `frontend/lib/public-origin.ts`: read per call, dev/build fallback, throw otherwise; `NODE_ENV` as the mode switch) and is likely out of scope.
- Tests pass the test Postgres details through `process.env` (`src/db/testing/test-server.ts`).
