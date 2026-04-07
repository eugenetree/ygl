# Technology Stack

**Analysis Date:** 2026-04-07

## Languages

**Primary:**
- TypeScript 5.5 - All application source code in `src/`

**Secondary:**
- JavaScript - Emitted build output in `dist/`

## Runtime

**Environment:**
- Node.js 22 (Docker image: `node:22-alpine`; local dev environment running 18.20.3)
- ESM modules (`"type": "module"` in `package.json`)

**Package Manager:**
- npm
- Lockfile: `package-lock.json` present

## Frameworks

**Core:**
- None (no web framework; this is a scraper/bot service, not an HTTP server)

**Dependency Injection:**
- InversifyJS 7.9 - IoC container used throughout; classes decorated with `@injectable()`, container wired in `src/main.ts`

**Testing:**
- Node built-in test runner (`node --test`) with tsx for TypeScript execution - no external test framework

**Build/Dev:**
- tsx 4.19 - TypeScript execution for dev and scripts (`npx tsx`)
- nodemon 3.1 - Dev hot-reload watcher
- TypeScript compiler (`tsc`) - Production build to `dist/`
- Prettier 3.5 with `@trivago/prettier-plugin-sort-imports` - Code formatting
- ESLint 9 with `typescript-eslint` - Linting

## Key Dependencies

**Critical:**
- `inversify` 7.9 + `reflect-metadata` 0.2 - DI framework; `reflect-metadata` must be imported first in entry points
- `kysely` 0.27 - SQL query builder with full TypeScript type safety; schema defined in `src/db/types.ts`
- `pg` 8.12 - PostgreSQL driver used by Kysely
- `@elastic/elasticsearch` 8.12 - Elasticsearch client for caption full-text search
- `telegraf` 4.16 - Telegram Bot API framework
- `ytdlp-nodejs` 3.4 - Node.js wrapper around the `yt-dlp` binary
- `axios` 1.7 - HTTP client (wrapped in `src/modules/_common/http/index.ts`)
- `zod` 3.23 - Schema validation (used in `src/modules/_common/validation/validator.ts`)

**Utilities:**
- `lodash-es` 4.17 - Used sparingly (e.g., `pick` in `video.mapper.ts`)
- `valibot` 0.37 - Present in `package.json` but no active usage found in `src/`
- `compromise` 14.15 - NLP library in `package.json` but no active usage found in `src/`
- `youtube-search-api` 1.2 - In `package.json` but no active usage found in `src/`

## Configuration

**Environment:**
- Configured via environment variables; documented in `.env.example`
- Key vars: `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `DB_HOST`, `DB_PORT`, `ES_NODE`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`
- Docker Compose passes env vars through from host `.env` file

**TypeScript:**
- `tsconfig.json`: target ES2022, module nodenext, strict mode, `experimentalDecorators: true`, `emitDecoratorMetadata: true`, outDir `./dist`
- No path aliases configured

**Build:**
- `tsconfig.json` at project root
- Output: `dist/` directory (excluded from TypeScript, committed as build artifact)

## Platform Requirements

**Development:**
- Docker + Docker Compose (services: app, db/postgres:18-alpine, elasticsearch:8.12.0, kibana:8.12.0)
- `yt-dlp` binary installed in Docker image via curl from GitHub releases
- Python 3 required in container (dependency for yt-dlp)

**Production:**
- Docker container (`Dockerfile.prod`): multi-stage build, copies compiled `dist/` from builder stage
- PostgreSQL 18 (Alpine)
- Elasticsearch 8.12 (single-node, xpack security disabled)

---

*Stack analysis: 2026-04-07*
