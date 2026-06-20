# SayThis Scraping

YouTube scraping pipeline that discovers channels and videos, downloads captions,
and indexes them for search. Controlled remotely via a Telegram bot, with state
held in Postgres.

## Language

**Scraper**:
One pipeline stage that processes one job type (`CHANNEL_DISCOVERY`, `CHANNEL`, `VIDEO_DISCOVERY`, `VIDEO`); enumerated by `ScraperName`.
_Avoid_: worker (reserved for the class that runs a scraper's loop)

**Scraper Instance**:
One scraper container with its own VPN exit region (e.g. US, GB), running all enabled Scrapers against the shared job queues.
_Avoid_: "scraper" alone when meaning the container, scraping container

**Job**:
A unit of work in a per-scraper queue table (`channelJobs`, etc.), claimed atomically with `FOR UPDATE SKIP LOCKED`; region-agnostic — any Scraper Instance may claim any Job.

## Relationships

- A **Scraper Instance** runs one orchestrator loop cycling through enabled **Scrapers**
- Lifecycle (requested/actual status, heartbeat) belongs to the **Scraper Instance** — each is started, stopped, and monitored independently; there is no fleet-wide command, every lifecycle action targets exactly one instance via a Telegram picker
- Scraper config (which **Scrapers** are enabled) also belongs to the **Scraper Instance** — keyed by (instance, scraper), so instances can run different stage sets
- A **Scraper Instance** self-registers on first boot (identity from `SCRAPER_INSTANCE_ID` env, an opaque label — actual VPN exit country is observed, not assumed) with all **Scrapers** disabled; it does no work until armed via `/config`
- Each **Scraper** claims **Jobs** from its own queue table
- **Jobs** have no affinity to a **Scraper Instance** — instances exist purely for throughput (more IPs, parallel processing), not region-specific content

## Example dialogue

> **Dev:** "GB is stopped — does that mean video jobs queue up for it?"
> **Domain expert:** "No. Jobs don't belong to an instance. The US **Scraper Instance** keeps draining the same queues; GB being down just means less throughput."

## Flagged ambiguities

- "scraper" was used to mean both the pipeline stage (`ScraperName`) and the
  docker container — resolved: the stage is a **Scraper**, the container is a
  **Scraper Instance**.
