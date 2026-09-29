# 02 — Group compose environment into shared blocks and require its variables

**What to build:** A developer reading `docker-compose.yml` can see what each
service depends on, and an operator starting the stack with an incomplete `.env`
gets an error naming the missing variable instead of a stack running on default
credentials.

Today a single `&app-env` anchor is defined inline on `bot` and reused by every
application service, so `api` carries Postgres variables it never opens a
connection with, and `sync-elastic` and `api` carry Telegram credentials neither
reads. Separately the Postgres credentials fall back to `admin`/`admin`/
`saythis`, so a missing `.env` produces a running stack rather than a failure.

After this ticket the shared variables live in three top-level `x-` blocks
grouped by the dependency they address — Postgres, Elasticsearch, Telegram — and
each service merges only the blocks it actually reads. Variables are required by
default; the exceptions are switches, which are legitimately absent most of the
time.

The switch/setting distinction matters because compose interpolates the whole
file on every command: a required marker anywhere makes that variable required
even for `docker compose up db`. `IS_API_ENABLED` is a switch — `main-api.ts`
treats its absence as "do not start" — so requiring it would mean a fresh clone
could not start the database until it had set a flag that only turns off one
optional service.

This also fixes `APP_ENV`, which the scraper's seeder reads but which compose
has never passed to any container, so its documented behaviour — seed a small
development word list instead of the full dictionary — has never worked.

The one behavioural risk is the narrowing. The claim that nothing reads what is
being removed rests on `start:api` being the only start script without a
migration step, `ApiServer` resolving only to the captions search path, and the
Telegram modules appearing only in the bot and scraper entrypoints. The
bring-up criterion is what confirms it.

The narrowing cuts the other way too: `bot` reads Elasticsearch, which an
earlier draft of this ticket missed. Its `/find` and `/resync` commands reach
`CaptionsService` through `TelegramBot → FindController →
FindCaptionsUseCase`. `captions.service.ts` falls back to the same
`http://elasticsearch:9200` the block supplies, so dropping `ES_NODE` there
would have broken nothing today and gone unnoticed until the service or port
moved.

**Blocked by:** 01 — it rewrites the compose `build:` line that this ticket
would otherwise have to preserve.

**Status:** ready-for-agent

- [ ] Three top-level `x-` blocks exist: `x-postgres-env` (the three credentials
      plus the hardcoded host and port), `x-es-env` (the node URL), and
      `x-telegram-env` (bot token and chat ID)
- [ ] `bot` receives all three; `sync-elastic` receives Postgres and
      Elasticsearch; `api` receives Elasticsearch only; `scraper` receives
      Postgres and Telegram plus its own switches
- [ ] The `db` service reuses the Postgres block whole
- [ ] The Postgres credentials and both Telegram variables are required, and a
      missing one stops compose with the variable's name
- [ ] The VPN variables, the yt-dlp cookies, `APP_ENV` and `IS_API_ENABLED` are
      optional and render as empty when unset
- [ ] `APP_ENV` reaches the scraper and no other service; unset still selects
      the full dictionary
- [ ] The database healthcheck interpolates the user and database name inline,
      since its shell argument cannot reference a block
- [ ] `elasticsearch` and `kibana` use map-form environment like every other
      service, with the security flag quoted so it is not parsed as a boolean
- [ ] `STOP_GRACE_PERIOD` is removed from `.env.example` (nothing reads it) and
      `IS_API_ENABLED` is added (set in `.env`, never documented)
- [ ] `DB_HOST`, `DB_PORT` and `ES_NODE` stay in `.env.example` — compose
      hardcodes them, but the rollback target runs on the host and reads them
- [ ] `docker compose config` against the current `.env` differs from the
      previous commit only by: Postgres variables dropped from `api`, Telegram
      variables dropped from `sync-elastic` and `api`, `ES_NODE` dropped from
      `scraper`, `APP_ENV` added to `scraper`, and host/port appearing on `db`.
      `bot` and `sync-elastic` are byte-identical, and the three `x-` blocks
      appear at the top level of the rendered output
- [ ] Commenting out each required variable in turn makes `docker compose config`
      fail naming that variable
- [ ] The stack comes up with `bot`, `sync-elastic` and `api` running,
      migrations still executing on start, and the API still serving search

**Verification note:** `docker compose config` renders warning-free and its diff
against the previous commit is exactly the set above. Each of the five required
variables, removed in turn, fails with `required variable <NAME> is missing a
value: set it in .env — see .env.example` — the `:?` markers carry an explicit
message because compose v2.13 otherwise prints an empty explanation wrapped in a
misleading `invalid interpolation format` line. `APP_ENV=development` renders on
`scraper` and nowhere else. The stack came up with `bot`, `sync-elastic` and
`api` running, migrations executed on the two that run them, and
`GET /api/search?q=hello` returned 200 with a hit — confirming `api` serves
search with no `POSTGRES_*` in its environment, which was the narrowing's one
real risk.

Two deviations from this ticket as written, both explained in the body above:
`bot` also merges `x-es-env`, and `scraper` loses `ES_NODE`. The `x-elastic-env`
name was changed to `x-es-env` after review, in compose and in the spec.

`bot` was verified through the same local override ticket 01 describes — Docker
Desktop does not share `/opt`, so compose's `/opt/ygl/logs` bind mount has to be
swapped for `./logs` on macOS. Still a pre-existing defect in the compose file,
still untouched by this ticket.

The full test suite is 117/118. The one failure, `YtDlpClient.getVersion()`
invoking the real binary, reproduces on the unmodified tree and is unrelated —
nothing under `src/` changed here.
