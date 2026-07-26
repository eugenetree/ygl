# Technology Stack

**Analysis Date:** 2026-07-26

## Languages

**Primary:**
- TypeScript 5.7.0 - All backend and frontend source code
- JavaScript - Runtime output compiled from TypeScript

**Secondary:**
- Shell (Bash/sh) - Docker entrypoints and deployment scripts
- SQL - Database migrations and queries (through Kysely ORM)

## Runtime

**Environment:**
- Node.js 22 (Alpine) - Backend runtime
- npm - Package manager

**Package Manager:**
- npm - Lockfile: `package-lock.json` (present)

## Frameworks

**Core Backend:**
- inversify 7.9.1 - Dependency injection container
- Telegraf 4.16.3 - Telegram bot framework (for bot control interface)

**Database:**
- Kysely 0.27.5 - Type-safe SQL query builder with PostgreSQL support
- pg 8.12.0 - PostgreSQL driver

**Search/Indexing:**
- @elastic/elasticsearch 8.12.0 - Elasticsearch client for caption search

**Frontend:**
- Next.js 15.1.0 - React framework for web UI
- React 19.0.0 - UI library
- React-DOM 19.0.0 - React DOM rendering

**HTTP Client:**
- axios 1.7.7 - HTTP client with proxy and request queue support

**YouTube Data:**
- ytdlp-nodejs 3.4.2 - Node.js wrapper for yt-dlp (video/caption extraction)
- youtube-search-api 1.2.2 - YouTube search functionality
- compromise 14.15.0 - Natural language processing for text analysis

**Utility:**
- lodash-es 4.17.21 - Utility functions
- valibot 0.37.0 - Schema validation
- zod 3.23.8 - Schema validation and type inference
- adm-zip 0.5.17 - ZIP file handling
- reflect-metadata 0.2.2 - Required for inversify decorators

## Testing

**Runtime:**
- Node.js built-in test runner - `node --test` command
- pg-mem 3.0.14 - In-memory PostgreSQL mock database for testing

**Assertion:**
- Node.js built-in assert/strict - Standard assertions

## Build & Development

**Transpilation:**
- TypeScript (tsc) - Compilation to CommonJS
- tsx 4.21.0 - TypeScript execution for scripts

**Linting & Formatting:**
- Biomejs 2.4.16 - Linter and code formatter
  - Config: `biome.json`
  - Formatter: 2-space indents, 80-char line width

**Decorators:**
- @babel/plugin-proposal-decorators 7.28.0 - Legacy decorator support
- @babel/preset-typescript 7.28.5 - TypeScript Babel preset

**Git Hooks:**
- husky 9.1.7 - Git hook manager
- lint-staged 17.2.0 - Run linters on staged files

**Development Utilities:**
- nodemon 3.1.4 - Auto-reload during development
- ts-node 10.9.2 - Direct TypeScript execution

## Configuration

**Environment:**
- Environment variables for configuration (see INTEGRATIONS.md for required vars)
- Database connection via `POSTGRES_*` environment variables
- Elasticsearch via `ES_NODE` environment variable
- Telegram bot via `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID`

**Build Output:**
- TypeScript compiles to CommonJS in `dist/` directory
- Source maps disabled
- Strict type checking enabled

**Module System:**
- CommonJS modules (Node.js compatible)
- ES modules in frontend (Next.js)

## Platform Requirements

**Development:**
- Node.js 22 (Alpine-compatible)
- PostgreSQL 18 (via Docker)
- Elasticsearch 8.12.0 (via Docker)
- OpenVPN (for scraper with VPN support)
- yt-dlp binary (downloaded in Docker build)

**Production:**
- Node.js 22 (Alpine base)
- PostgreSQL 18
- Elasticsearch 8.12.0
- Docker & Docker Compose for orchestration
- OpenVPN configuration for scraper instances

## Deployment

**Container Images:**
- Multi-stage production builds (Dockerfile.prod)
- Development builds with live reload (Dockerfile.dev)
- Specialized scraper image with VPN support (Dockerfile.scraper)
- Base: node:22-alpine

**Orchestration:**
- Docker Compose - Coordinates bot, scraper, API, sync services
- Services deployed as containers with shared PostgreSQL and Elasticsearch

---

*Stack analysis: 2026-07-26*
