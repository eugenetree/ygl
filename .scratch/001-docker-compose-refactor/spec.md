# Spec: One Dockerfile, and configuration from .env everywhere

Status: ready-for-agent

## Problem Statement

The Docker configuration has four problems, all of which make the files lie
about what they do.

**The default build produces an image that cannot start.** `docker-compose.yml`
builds the app image from `${DOCKERFILE:-Dockerfile.dev}`, and `.env` does not
set `DOCKERFILE`. So a plain `docker compose build` on a clean checkout uses
`Dockerfile.dev`, which runs `npm install` and copies the source but never runs
`tsc`. `.dockerignore` excludes `dist`, and every `start:*` script in
`package.json` runs `node dist/src/…`. The resulting image exits immediately on
every service. The containers currently running were built with
`DOCKERFILE=Dockerfile.prod` supplied out of band, which means the image a
machine produces depends on a shell variable rather than on the commit. Two
developers on the same commit get different images, and one of them gets a
broken one.

**Every application service receives every variable.** A single `&app-env`
anchor is defined inline on the `bot` service and reused by the other three.
`api` carries `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `DB_HOST`
and `DB_PORT` despite never opening a database connection — `start:api` is the
only start script that skips migrations, and its object graph resolves to
Elasticsearch only. `sync-elastic` and `api` both carry `TELEGRAM_BOT_TOKEN`
and `TELEGRAM_CHAT_ID`, which only `bot` and `scraper` read. Reading the file
tells you nothing about what a service actually depends on, and adding a
variable for one service adds it to all four.

**Credentials fall back to defaults, and two documented variables reach
nothing.** `POSTGRES_USER`, `POSTGRES_PASSWORD` and `POSTGRES_DB` are written
as `${VAR:-admin}` style fallbacks, so a missing or half-filled `.env` yields a
running stack on default credentials instead of an error — the failure surfaces
later as an authentication error or an empty database name. Separately,
`.env.example` documents `STOP_GRACE_PERIOD`, which is read by nothing in the
repository, and `APP_ENV`, which the scraper's seeder reads but which compose
passes to no container. The documented behaviour of `APP_ENV` — seed a small
development word list instead of the full dictionary — has therefore never
worked in Docker.

**The Makefile hardcodes the credentials that `.env` exists to supply.** It
already does `include .env` and `export`, so every variable is available as a
make variable, and the R2 targets do use `$(R2_ACCESS_KEY_ID)` and
`$(R2_SECRET_ACCESS_KEY)`. The database targets do not: `admin` is written out
eight times and `saythis` seven, across `db-connect`, `db-export`,
`db-load-dump`, `db-restore` and `db-reset`. They work today only because the
working `.env` happens to contain exactly those two values. Change
`POSTGRES_DB` in `.env` and compose builds a stack against the new database
while every Makefile target keeps talking to the old one — and `db-reset` would
drop a database that nothing is using while leaving the live one untouched.

The same defect appears in the R2 targets from the other direction. The bucket
and folder are hardcoded as `s3://saythis/saythis-saythis-trr9pp_db/` in two
places, while `.env.example` documents `R2_BUCKET` and `R2_FOLDER` for exactly
that purpose. `R2_BUCKET` is set in the working `.env` and read by nothing;
`R2_FOLDER` is not set at all. Two variables exist to configure a path that is
not configurable.

## Solution

One `Dockerfile`, used by every environment. The build no longer depends on a
shell variable.

Compose declares its shared variables once, in top-level `x-` blocks grouped by
the dependency they address — Postgres, Elasticsearch, Telegram. Each service
merges only the blocks it actually reads, so the file becomes a readable
dependency map: `api` visibly needs Elasticsearch and nothing else.

Variables are required by default. A missing one stops the stack immediately and
names itself, rather than resolving to a default or an empty string. The
exception is switches — the VPN credentials, `APP_ENV`, `IS_API_ENABLED` —
which are legitimately absent most of the time and stay explicitly optional.

The Makefile reads the same `.env` for the same values. No credential, database
name, bucket or folder is written into a recipe. `.env` becomes the single place
that decides which database the stack builds and which database the tooling
talks to, so the two can no longer disagree.

## User Stories

1. As a developer cloning the repository, I want `docker compose build` to
   produce a working image without setting any shell variable first, so that the
   image I get is determined by the commit rather than by my environment.
2. As a developer, I want exactly one `Dockerfile` for the application, so that
   I never have to work out which of two files is the real one.
3. As a developer, I want the deleted development image to stay deleted, so that
   nobody re-adds a variant that cannot produce a runnable container.
4. As a developer reading `docker-compose.yml`, I want each service to list only
   the variables it reads, so that I can see what it depends on without opening
   the source.
5. As a developer, I want the Postgres connection variables written in exactly
   one place, so that changing the database name cannot leave one service
   pointing at the old one.
6. As a developer, I want the Telegram credentials written in exactly one place,
   so that rotating the bot token is a single edit.
7. As a developer, I want the Elasticsearch node URL grouped with the other
   shared variables, so that the services that talk to Elasticsearch are
   identifiable at a glance.
8. As a developer adding a variable that several services need, I want to add it
   to one block, so that I do not have to remember which services to update.
9. As a developer adding a variable that one service needs, I want to add it to
   that service, so that it does not silently appear in three others.
10. As an operator starting the stack with an incomplete `.env`, I want compose
    to refuse to start and name the missing variable, so that I fix the cause
    rather than debug a downstream authentication error.
11. As an operator, I want a missing `POSTGRES_PASSWORD` to be an error rather
    than an empty string, so that a database can never come up with credentials
    nobody chose.
12. As an operator, I want the VPN credentials to remain optional, so that I can
    run the rest of the stack locally without them.
13. As an operator, I want `YTDLP_COOKIES_B64` to remain optional, so that the
    scraper runs without cookies until YouTube demands them.
14. As an operator, I want `IS_API_ENABLED` to remain optional, so that leaving
    it unset disables the API service without blocking every other compose
    command.
15. As a developer working locally, I want `APP_ENV=development` to reach the
    scraper container, so that the seeder uses the small development word list
    as `.env.example` has always claimed it would.
16. As an operator on the server, I want an unset `APP_ENV` to keep seeding the
    full dictionary, so that this change alters nothing in production.
17. As a developer reading `.env.example`, I want every variable in it to be
    read by something, so that I do not spend time setting one that has no
    effect.
18. As a developer reading `.env.example`, I want `IS_API_ENABLED` documented,
    so that I know the API service exists and how to turn it on.
19. As a developer, I want `DB_HOST`, `DB_PORT` and `ES_NODE` to stay in
    `.env.example`, so that the Makefile targets that run scripts on the host
    rather than in a container keep working.
20. As a developer who changes `POSTGRES_DB` in `.env`, I want `make db-connect`
    to open the database the stack is actually running, so that the tooling and
    the containers cannot drift apart.
21. As a developer, I want `make db-reset` to drop the database named in `.env`,
    so that it can never drop one database while the stack uses another.
22. As a developer, I want `make db-export` and `make db-restore` to use the
    credentials from `.env`, so that rotating the Postgres password is one edit
    rather than a search through recipes.
23. As a developer, I want the database name to appear in no Makefile recipe, so
    that renaming the project's database is a single change.
24. As a developer running a database target with an incomplete `.env`, I want
    the target to stop and name the missing variable, so that I do not get an
    unexplained `psql` usage error from an empty flag.
25. As a developer, I want `make r2-download-latest` to read the bucket and
    folder from `.env`, so that the variables `.env.example` documents for that
    purpose actually control it.
26. As a developer pointing the tooling at a different R2 folder, I want to
    change `.env` rather than edit two places in a shell pipeline, so that the
    two occurrences cannot diverge.
27. As a developer, I want the Elasticsearch and Kibana services to use the same
    environment syntax as every other service, so that the file has one style
    rather than two.
28. As a reviewer, I want `git log --follow Dockerfile` to show the history of
    the file it was renamed from, so that the rename does not read as a new
    file with no past.
29. As a future reader, I want `docker compose config` to render a
    fully-resolved configuration, so that I can confirm what each container
    receives without starting anything.
30. As a developer, I want the running stack to behave identically after this
    change, so that the refactor can be verified by comparison rather than by
    trust.

## Implementation Decisions

**One Dockerfile, no variant.** `Dockerfile.prod` becomes `Dockerfile`, moved
with `git mv` so history follows. `Dockerfile.dev` is deleted. The
`${DOCKERFILE}` indirection is removed from compose entirely — the build
hardcodes `dockerfile: Dockerfile` — and `DOCKERFILE` is removed from
`.env.example`. If a development image is ever wanted, it should be a
multi-stage `target:` in the same file rather than a second file.
`Dockerfile.scraper` is unaffected and remains separate.

**Shared variables live in top-level `x-` blocks, grouped by dependency.** Three
blocks: `x-postgres-env` (the three credentials plus `DB_HOST: db` and
`DB_PORT: 5432`), `x-es-env` (`ES_NODE`), and `x-telegram-env` (the bot
token and chat ID). The `x-` prefix only stops compose rejecting an unknown
top-level key; the YAML anchor on each block is what makes it reusable.

**The blocks cover `environment:` only.** `depends_on`, `volumes`, `image` and
`build` stay written out per service. `volumes` is a YAML sequence and cannot be
merged at all, so an anchor there helps only until the first service needs an
extra mount. Keeping the blocks to variables means one indirection to follow and
each service's wiring reads top to bottom.

**Services merge only the blocks they read.** `bot` takes all three;
`sync-elastic` takes Postgres and Elasticsearch; `api` takes Elasticsearch only;
`scraper` takes Postgres and Telegram plus its own switches. Multi-anchor merge
(`<<: [*a, *b]`) is used where a service needs two blocks. This drops
`POSTGRES_*` from `api`, `TELEGRAM_*` from `sync-elastic` and `api`, and
`ES_NODE` from `scraper` — none of which are read by those services today.

`bot` needs Elasticsearch, which an earlier draft of this decision missed. Its
`/find` and `/resync` commands reach `CaptionsService` through
`TelegramBot → FindController → FindCaptionsUseCase`, and that constructor reads
`ES_NODE`. Dropping it would not have broken anything today, because
`captions.service.ts` falls back to the same `http://elasticsearch:9200` the
block supplies — which is exactly why the mistake would have gone unnoticed
until someone moved the service or the port. The service list is only a
dependency map if it is complete.

**The `db` service reuses `x-postgres-env` whole.** It receives `DB_HOST` and
`DB_PORT` as well, which the Postgres image ignores. The alternative — splitting
credentials and address into two nested blocks — was rejected as more structure
than the saving justifies. The healthcheck must interpolate `POSTGRES_USER` and
`POSTGRES_DB` inline, because its `CMD-SHELL` argument is a string and cannot
reference an anchor.

**Required variables use `${VAR:?}`; switches use `${VAR:-}`.** Unset or empty
both count as missing for `:?`, and compose fails with the variable's name
rather than warning and substituting an empty string. Required: the three
Postgres credentials and the two Telegram variables. Optional: `VPN_USER`,
`VPN_PASS`, `VPN_CONFIG_B64`, `YTDLP_COOKIES_B64`, `APP_ENV`, `IS_API_ENABLED`.

The distinction is switch versus setting. Compose interpolates the entire file
on every command, so a `:?` anywhere makes that variable required even for
`docker compose up db`. Applying it to `IS_API_ENABLED` would mean a fresh clone
could not start the database until it had set a flag whose only job is to turn
off one optional service. `main-api.ts` treats the variable's absence as "do not
start", so absence is a supported state by design.

**`APP_ENV` is passed to the scraper.** Added as `${APP_ENV:-}` to the scraper's
environment only, since the seeder is the sole reader. Unset resolves to the
full dictionary exactly as today, so production behaviour is unchanged.

**Elasticsearch and Kibana move to map-form environment.** Both currently use
list form (`- KEY=value`) while every other service uses map form. They are
normalised for consistency. `xpack.security.enabled` is quoted so YAML does not
parse it as a boolean. The Elasticsearch URL stays written out in both
`x-es-env` (as `ES_NODE`) and Kibana (as `ELASTICSEARCH_HOSTS`) rather than
being hoisted into a shared scalar anchor — the two keys stay independently
readable, at the cost of two edits if the port or service name ever changes.

**`.env.example` changes.** Remove `DOCKERFILE` and `STOP_GRACE_PERIOD`. Add
`IS_API_ENABLED`, which is set in the working `.env` but was never documented.
Keep `APP_ENV`, which now works. Keep `DB_HOST`, `DB_PORT` and `ES_NODE`:
compose hardcodes them, but `make db-rollback` runs `npm run
db:migration:rollback` on the host, where they are read from `.env`.

**The Makefile reads Postgres credentials from `.env`.** Every `admin` becomes
`$(POSTGRES_USER)` and every `saythis` becomes `$(POSTGRES_DB)`, across
`db-connect`, `db-export`, `db-load-dump`, `db-restore` and `db-reset`. The
`include .env` / `export` block at the top already makes these available; no new
mechanism is needed.

Two things stay literal. The `-d postgres` in the drop-and-create recipes is the
built-in maintenance database, not the project's — it is the connection you must
use *because* you are dropping `$(POSTGRES_DB)`, and substituting it would break
the recipe. The container names in `docker exec db` and `docker exec bot` are
compose `container_name` values, not configuration, and stay as they are.

`POSTGRES_PASSWORD` is not substituted anywhere, because these recipes never
need it: they run `psql` and `pg_dump` *inside* the container over a local
socket, which the official Postgres image trusts without a password. Adding it
would imply a dependency that does not exist.

**The Makefile reads the R2 bucket and folder from `.env`.** Both occurrences of
`s3://saythis/saythis-saythis-trr9pp_db/` become
`s3://$(R2_BUCKET)/$(R2_FOLDER)/`. `R2_FOLDER` is documented in `.env.example`
but missing from the working `.env`, so it must be added there as part of this
change or `r2-download-latest` will start listing a bucket root.

**Database and R2 targets guard their variables.** This is the Makefile analogue
of the `${VAR:?}` decision, and the one addition beyond a literal substitution.
Without it, a missing `.env` turns `-U admin` into `-U ` and the developer gets
a `psql` usage error that names nothing. A single pattern rule covers every
target:

```make
guard-%:
	@test -n "$($*)" || { echo "$* is not set — see .env.example"; exit 1; }

db-connect: guard-POSTGRES_USER guard-POSTGRES_DB
	docker exec -it db psql -U $(POSTGRES_USER) -d $(POSTGRES_DB)
```

Applied to the five database targets (`POSTGRES_USER`, `POSTGRES_DB`) and to
`r2-download-latest` (`R2_BUCKET`, `R2_FOLDER`, `R2_ENDPOINT`,
`R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` — the last three are already used
unguarded today). Targets that touch neither are left alone.

**No ADR.** Considered and declined. The single-Dockerfile decision is visible
in the diff, and the narrowed environment is legible from the code — `start:api`
has no migration step and its graph resolves to Elasticsearch, so its missing
`POSTGRES_*` does not read as an oversight.

## Testing Decisions

There is no code seam here and no new one is proposed. Nothing in `src/` changes,
so no test file changes.

There are two verification seams, one per file, and both render the resolved
result without executing anything.

For compose it is `docker compose config`, which resolves interpolation and
anchor merges and prints the fully-rendered configuration without starting a
container. For the Makefile it is `make -n <target>`, which expands every
variable and prints the command it would run without running it — so a recipe
that drops a database can be verified by reading the exact `psql` line it
resolved to. Both are the highest seam available: each exercises the entire
mechanism this spec touches, in one command, with no side effects.

Verification steps, in order:

1. `docker compose config` succeeds with the current `.env`, and its output is
   compared against the same command on the previous commit. The only expected
   differences are the dropped variables (`POSTGRES_*` from `api`,
   `TELEGRAM_*` from `sync-elastic` and `api`), the added `APP_ENV` on
   `scraper`, and `DB_HOST`/`DB_PORT` appearing on `db`. Every other service's
   rendered environment must be byte-identical.
2. Each required variable is commented out of `.env` in turn and
   `docker compose config` is confirmed to fail naming that variable.
3. Each optional variable is confirmed absent from `.env` and
   `docker compose config` is confirmed to succeed, rendering it as empty.
4. `docker compose build` succeeds with no `DOCKERFILE` set in the environment,
   which is the case that produces a broken image today.
5. The stack is brought up and `bot`, `sync-elastic` and `api` reach a running
   state, confirming migrations still run and the API still serves.
6. `make -n` on each of the five database targets and on `r2-download-latest`
   is compared against the same command on the previous commit. With the
   working `.env`, every resolved line must be byte-identical — `.env` contains
   `admin` and `saythis`, so a correct substitution changes nothing.
7. `POSTGRES_DB` is temporarily changed in `.env` and `make -n db-reset` is
   confirmed to name the new database in both the `DROP` and the `CREATE`, while
   still connecting with `-d postgres`.
8. `POSTGRES_USER` is commented out of `.env` and each guarded target is
   confirmed to fail with the variable's name rather than reaching `psql`.
9. `make -n r2-download-latest` is confirmed to resolve
   `s3://$(R2_BUCKET)/$(R2_FOLDER)/` to the same path that is hardcoded today,
   after `R2_FOLDER` is added to `.env`.

Step 7 is the one that proves the point of the change: it is currently
impossible to make it pass.

Prior art: none. No test in this repository covers Docker or Make configuration,
and this spec does not add the first one — the cost of a rendering test exceeds
its value at this size, and `make -n` plus `docker compose config` already give
the same evidence on demand.

## Out of Scope

- **The dump format mismatch between `db-export` and `db-load-dump`.**
  `db-export` runs `pg_dump` with no `-F`, producing plain SQL, while
  `db-load-dump` and `db-restore` run `pg_restore`, which reads only archive
  formats. A file produced by `make db-export` cannot be loaded by either. The
  restore targets work in practice because the dumps they are used on come from
  R2 in archive format. Noticed while substituting the credentials in those same
  lines; fixing it means choosing between `-Fc` on the export and `psql -f` on
  the import, which is a decision, not a substitution.
- **`make db-migrate` and `make db-fresh` against the shipped image.** Both run
  `docker exec bot npm run …` on scripts invoked through `tsx`, but the runtime
  stage copies only `package*.json`, `dist` and `entrypoint.sh` — no `src/` —
  and `npm ci --omit=dev` drops `tsx`. Neither target can work against the image
  actually deployed. Already true; deleting `Dockerfile.dev` makes it permanent
  rather than theoretical. Not fixed here.
- **Restart policies.** Only `db` has `restart: always`. Whether the application
  services should restart, and whether `scraper` should restart when its VPN
  credentials are missing, is a separate decision.
- **Replacing `IS_API_ENABLED` with a compose profile.** Moving the switch to
  `profiles: [api]` and deleting the guard in `main-api.ts` was considered. It
  touches `src/` and changes how the stack is brought up on the server.
- **`x-` blocks for `depends_on`, `volumes`, `image` and `build`.** Considered
  and declined above.
- **A shared scalar anchor for the Elasticsearch URL.** Considered and declined
  above.
- **`Dockerfile.scraper`.** Stays a separate file with its own build.

## Further Notes

Two behaviours were verified against the local Docker daemon rather than assumed,
because the design depends on them:

- **Multi-anchor merge works.** `<<: [*a, *b]` renders both maps correctly
  through `docker compose config`. The design uses it for `bot`,
  `sync-elastic` and `scraper`.
- **Compose resolves a sibling build.** A service that declares only
  `image: saythis-app:latest` picks up the image built by a sibling service in
  the same project, from a cold image cache, without attempting a registry pull.
  This was a suspected fragility in the current file — `build:` lives only on
  `bot` while `sync-elastic` and `api` reference the tag — and it is not one.
  Leaving `build:` on `bot` alone is therefore a style choice, not a defect, and
  it stays as it is.

The one behavioural risk in this change is the narrowing. `api` loses
`POSTGRES_*` and two services lose `TELEGRAM_*`. The claim that none of them read
those variables rests on: `start:api` omitting the migration step that the other
three run; `ApiServer` depending only on `FindCaptionsUseCase`; and
`TelegramNotifier`/`TelegramBot` appearing only in `main-bot.ts` and
`main-scraper.ts`. Verification step 5 is what confirms it.

The Makefile half carries the opposite risk. Against the current `.env` it is a
pure no-op — `POSTGRES_USER` is `admin` and `POSTGRES_DB` is `saythis`, so every
resolved recipe is byte-identical before and after. That makes it safe, and it
also makes it impossible to tell a correct substitution from a broken one by
running the targets. Step 7 exists for that reason: temporarily changing
`POSTGRES_DB` is the only way to observe that the substitution took effect.

`R2_FOLDER` is the single new requirement this change places on an existing
`.env`. It is already documented in `.env.example`, but the working `.env` does
not have it, so `r2-download-latest` breaks the moment the hardcoded path is
replaced unless it is added first.
