# Per-instance scraper control plane

Multiple scraper containers (Scraper Instances, e.g. `us`/`gb` VPN exits) run
in parallel against the shared job queues, purely for throughput — jobs remain
region-agnostic and are distributed by the existing `FOR UPDATE SKIP LOCKED`
claiming. Each instance is identified by an opaque `SCRAPER_INSTANCE_ID` env
label, self-registers a `scrapingProcess` row on first boot, and owns its full
control plane: requested/actual status, heartbeat, and its own set of
`scraperConfig` rows keyed by (instance, scraper). Telegram lifecycle and
config commands are picker-first and always target exactly one instance.

## Decisions a future reader will question

### Per-instance config despite a throughput-only goal

If both instances exist only for throughput, a single global stage config would
suffice and is simpler. We chose per-instance config anyway so instances can be
specialized (e.g. only one instance runs the heavy `VIDEO` stage, or a stage is
disabled on one IP that YouTube started throttling) without touching code. The
cost is a composite key and an instance picker in `/config`.

### New instances register with all Scrapers disabled

An instance's first boot inserts its row and config with everything off; it
does no work until armed via `/config`. Alternatives rejected:

- **Default all-enabled** — silently resurrects stages that were deliberately
  disabled fleet-wide the moment a new instance (or a typo'd
  `SCRAPER_INSTANCE_ID`) boots.
- **Copy from an existing instance** — preserves intent but the template choice
  is arbitrary and the copying is invisible magic.

Disabled-by-default also makes a mistyped instance id inert and visible instead
of an immediately-scraping wrong identity.

### No fleet-wide command

`/start`, `/stop`, `/config` each reply with an instance picker; there is no
"all" option. Rationale: lifecycle is the most dangerous command family, the
fleet is small (2–3 instances), and an accidental fleet-wide graceful stop
discards in-progress session time. Revisit if the fleet grows past the point
where per-instance taps are tedious.

## Identity is a label, not geography

`SCRAPER_INSTANCE_ID` is opaque; naming instances after regions is a human
convention. The actual VPN exit country is observed at boot (ipinfo.io) and
reported in the boot notification as a sanity check. Deriving identity from the
observed country was rejected: it makes identity depend on a third-party call
and silently collides identities when a VPN config exits through an unexpected
country.

## Scope

Same-host, same-compose deployment only; Postgres stays bound to localhost.
Running instances on separate hosts would require securely exposing the
database and is out of scope. Cookie sets (`YTDLP_COOKIES_B64`) are
per-instance via compose env mapping — sharing one Google session across two
country IPs is a correlated bot-detection risk.
