# PRD: Multi-Instance Scraper Control Plane

## Problem Statement

The scraping pipeline runs as a single Docker container behind one VPN exit
(US). Throughput is capped by that single process and single IP: one orchestrator
loop, one yt-dlp pipeline, one exit address absorbing all of YouTube's rate
pressure. A second VPN credential set (GB) is already available but unusable,
because the entire control plane assumes exactly one scraper: one status row,
one heartbeat, unaddressed start/stop commands, and a global stage config. There
is no way to run a second container without the two processes fighting over the
same identity.

## Solution

Introduce the concept of a **Scraper Instance**: a scraper container with a
stable identity label and its own VPN exit, lifecycle, and stage configuration.
Two instances (`us`, `gb`) run in parallel on the same host against the shared
job queues. Jobs remain region-agnostic — the existing locked-claim mechanism
already distributes work safely between competing consumers, so a second
instance directly adds throughput.

Each instance self-registers in the database on first boot (with all scrapers
disabled, requiring explicit arming), maintains its own status and heartbeat
row, and obeys only commands addressed to it. The Telegram bot becomes
instance-aware: lifecycle and config commands first present an instance picker,
and all notifications identify which instance they came from.

## User Stories

1. As an operator, I want to run US and GB scraper containers in parallel, so that I process more channels and videos per day.
2. As an operator, I want each container to exit through its own VPN region, so that rate pressure is spread across two IPs.
3. As an operator, I want jobs to remain region-agnostic, so that any instance picks up any pending work and no job waits for a specific container.
4. As an operator, I want `/start` to show me a picker of registered instances, so that I start exactly the instance I mean.
5. As an operator, I want `/stop` to show the same picker, so that I can stop a misbehaving instance without touching the healthy one.
6. As an operator, I want no fleet-wide start/stop button, so that I never accidentally interrupt all in-progress scraping with one tap.
7. As an operator, I want `/config` to first ask which instance to configure, so that enabling a stage on GB cannot accidentally change US.
8. As an operator, I want per-instance stage toggles, so that I can specialize instances (e.g. only one runs the heavy video stage) without code changes.
9. As an operator, I want a new instance to register itself on first boot, so that adding a third region is a compose edit, not a migration.
10. As an operator, I want a newly registered instance to start with all scrapers disabled, so that it never silently resurrects work I deliberately turned off.
11. As an operator, I want a Telegram announcement when a new instance registers, so that I know it booted and remember to arm it via `/config`.
12. As an operator, I want a mistyped instance id to result in an inert, visible registration rather than a working impostor, so that identity mistakes are obvious instead of dangerous.
13. As an operator, I want every scraper-originated Telegram message prefixed with the instance id, so that I always know which container is talking.
14. As an operator, I want status-change notifications (started, stopped, error, killed) to name the instance, so that I know which one needs attention.
15. As an operator, I want each instance to report its observed VPN exit country at boot, so that I can verify the right VPN config landed in the right container.
16. As an operator, I want per-instance heartbeats, so that I can tell a dead GB container apart from a healthy US one.
17. As an operator, I want a start/stop command for one instance to leave the other completely unaffected, so that lifecycle operations are isolated.
18. As an operator, I want an instance that crashed with a stale RUNNING request to resume scraping after restart, so that recovery behavior I rely on today survives the multi-instance change.
19. As an operator, I want each instance to use its own YouTube cookie set, so that one Google session is never active from two countries at once and a flag on one set cannot take down both instances.
20. As an operator, I want per-region VPN credentials wired in compose without changing the container entrypoint, so that the VPN bootstrap stays a single battle-tested script.
21. As an operator, I want clear per-instance error replies in Telegram (e.g. "gb is already running"), so that command outcomes are unambiguous.
22. As a developer, I want one module to own instance registration, status, and heartbeat, so that "who exists and what state are they in" has a single, testable answer.
23. As a developer, I want the duplicated Postgres LISTEN plumbing collapsed into one reusable listener, so that instance-id filtering is implemented and tested once.

## Implementation Decisions

### Domain model (settled in the grilling session; see CONTEXT.md and ADR 0002)

- **Scraper Instance** = container + identity label + VPN exit. **Scraper** =
  pipeline stage (channel discovery, channel, video discovery, video). Jobs
  have no affinity to an instance.
- Identity comes from a `SCRAPER_INSTANCE_ID` environment variable. It is an
  opaque label; naming instances after regions is convention. The process
  fails fast at boot if the variable is missing. Observed exit country is
  reported, never used as identity.
- Instances self-register via upsert on boot. First-ever registration creates
  the instance's config rows with **every scraper disabled** and sends a
  Telegram announcement; subsequent boots are silent no-ops.
- Lifecycle (requested status, actual status, heartbeat) and stage config are
  both per-instance. There is no fleet-wide command.

### Modules

- **Instance Registry** (new, deep module): owns the scraping-process table,
  re-keyed by text instance id. Interface: register an instance (reporting
  whether it is new), list instances, get/update requested and actual status,
  record heartbeats, derive "process down" from heartbeat age. Absorbs the
  current status service (which hardcodes a single row) and the heartbeat's
  write path.
- **Register-instance use case** (new, scraper boot): orchestrates
  registration — registry upsert, disabled-config creation, announcement.
  Encapsulates the entire new-instance policy.
- **PG notification listener** (new, extracted): one reusable
  LISTEN/parse/dispatch component replacing the two near-duplicate clients
  (command listener on the scraper, status watcher on the bot). Instance-id
  filtering lives here.
- **Schema migrations**: scraping-process table re-keyed to text instance id
  with the seeded singleton row dropped; both NOTIFY trigger functions
  (requested- and actual-status) add the instance id to their payloads; scraper
  config table moves to a composite key (instance id, scraper name) and the
  existing global rows are dropped.
- **Scraper-side lifecycle**: the command listener ignores notifications
  addressed to other instances; the start use case loads only its own
  instance's enabled scrapers; startup reconciliation and shutdown
  status-writing operate on the instance's own row.
- **Telegram controllers**: lifecycle and config commands reply with an
  instance picker built from the registry's instance list; callback data
  carries the instance id; config then shows that instance's stage toggles.
  Status-change handling and all scraper-originated notifications prefix
  messages with the instance id.
- **Deployment**: two compose service blocks sharing the scraper image; the
  env file holds regional variable sets (VPN credentials, VPN config, cookies)
  which each service block maps onto the plain variable names the entrypoint
  and yt-dlp client already read — neither changes.

### Migration / first deploy

After the migration there are no instance or config rows; both instances
register disabled on first boot. The first deploy therefore requires one
`/config` pass per instance to arm the stages. This is the intended
new-instance behavior, accepted as a one-time step.

## Testing Decisions

Good tests assert **external behavior** through a module's public interface —
what an operator or collaborating module observes — never internal call
sequences or private state. Prior art in the repo: the channel-priority
calculator tests and the push-channel use-case tests (unit tests with test
doubles at module boundaries), and the fixture-based caption-similarity tests.

Modules to test ("as many tests as possible" was requested):

- **Register-instance use case**: first boot creates disabled config rows and
  announces; repeat boot does neither; missing identity fails fast.
- **Instance Registry**: status read/write round-trips per instance; heartbeat
  recency derives live vs process-down; instance listing reflects
  registrations; one instance's updates never affect another's row.
- **Notification listener / command filtering**: a command addressed to
  another instance is ignored; own-instance commands dispatch start/stop;
  malformed payloads are logged and skipped.
- **Telegram keyboard builders**: instance picker reflects the registry list;
  per-instance config keyboard reflects that instance's toggles; callback data
  round-trips instance id and scraper name (pure-function tests, mirroring the
  existing keyboard builder).

## Out of Scope

- **Region-affinity for jobs** (geo-locked content routed to a specific
  instance) — explicitly rejected; instances exist for throughput only.
- **Multi-host deployment** — Postgres stays bound to localhost; running
  instances on separate machines is a separate project.
- **Fleet-wide commands** — deliberately omitted; revisit only if the fleet
  grows beyond 2–3 instances.
- **Failure-handling changes for cookie-less instances** — avoided by giving
  every instance its own cookie set.
- **Autoscaling / dynamic instance counts** — instances are static compose
  service blocks.

## Further Notes

- **Measure before building**: verify host RAM/CPU headroom and VPN/host
  bandwidth during a video-stage session. If the uplink or VPN account
  throughput is the real bottleneck, a second instance adds load without
  adding throughput.
- Two OpenVPN tunnels coexist safely on one host because each container has
  its own network namespace.
- The job-claiming layer needs **no changes**: locked claiming with skipped
  locks already makes concurrent consumers safe.
- Design provenance: terminology in CONTEXT.md; trade-off rationale in ADR
  0002 (per-instance scraper control plane).
