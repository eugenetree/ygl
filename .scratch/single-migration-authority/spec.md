# Spec: One migration authority, and env vars that mean one thing

Status: ready-for-agent

Related: `docs/adr/0002-database-tests-run-against-real-postgres.md` (the
`corrupted migrations` failure mode this spec has to respect),
`docs/adr/0003-no-ci-enforcement-is-local-pre-commit.md` (why there is no CI to
catch what this spec deliberately does not test)

## Problem Statement

Three `make` targets do not work, and the reason is structural rather than a set
of independent bugs.

`make db-rollback` runs `npm` on the developer's machine. The Makefile includes
and exports `.env`, so the command inherits `DB_HOST=db` — a name that resolves
only inside the Docker network. It fails with `ENOTFOUND`. `make db-migrate` and
`make db-fresh` exec into the `bot` container and run npm scripts that invoke
`tsx` against `src/`, but the production image ships only `dist` and installs
with `--omit=dev`, so they fail with `ERR_MODULE_NOT_FOUND`. `make search` calls
an npm script that has never existed.

Underneath those is the actual defect. `docker-compose.yml` writes `DB_HOST`,
`DB_PORT` and `ES_NODE` as hardcoded literals and never interpolates them, so
the identically-named lines in `.env` reach no container at all. They *look*
authoritative — the values even match what the containers use — but their only
consumer is the host-side Makefile context, where they hold the wrong values.
The same is true of `STOP_GRACE_PERIOD`, which appears in `.env.example` and is
referenced nowhere. A developer editing `.env` cannot tell which variables do
something, and the ones that do something do the opposite of what they appear
to.

The deeper problem is that migrations have **two authorities over one migration
table**. Every application service replays migrations at boot from the image's
compiled output, while any host-side script would replay them from the working
tree. Kysely validates the migrations folder against `kysely_migration` on every
call — up *and* down — and hard-throws `corrupted migrations: previously
executed migration X is missing` when they disagree. Two folders, one table, and
a hard failure whenever they diverge.

Correcting the environment variables alone would therefore not be enough. A
host-side rollback would stop failing on hostname resolution and start failing
on migration validation instead, whenever the working tree and the shipped
image disagree — which is any branch that has added or removed a migration
since the image was built.

Finally, the targets that do reach a container reach it with `docker exec`,
which requires that container to be running. This creates a circular failure:
a bad migration crash-loops the application services at boot, and the rollback
command that would fix it is implemented as an exec into one of them.

## Solution

Migrations get exactly one authority: a dedicated `migrator` service, built from
the same image as the application services, which replays migrations to
completion and exits. The application services no longer migrate at boot; they
wait for `migrator` to finish successfully and then start. Deployment behaviour
is unchanged in spirit — migrations still apply automatically before the app
runs — but one thing does it instead of three.

The same service is the target for manual database work, invoked as a throwaway
container rather than an exec into a running one. Rollbacks and dev seeding
therefore run the same code, from the same compiled output, against the same
migration table as the automatic deploy-time run.

For that to be a property rather than a habit, the host-side route has to stop
existing. The npm scripts that replay migrations, roll them back and seed the
development database are removed, so the second authority cannot be invoked by
hand at all — not merely discouraged.

Environment variables are reduced to the ones that do something. The three that
reach no container are deleted, along with the unreferenced grace-period
variable. Nothing is added in their place: every remaining variable in `.env`
has a consumer, and the ports the stack publishes stay literals in the compose
file.

## User Stories

1. As a developer, I want `make db-rollback` to work, so that I can undo a
   migration I am iterating on without hand-writing a Docker command.
2. As a developer, I want `make db-migrate` to work against the image I actually
   ship, so that a manual migration run and a deploy-time run cannot disagree.
3. As a developer, I want `make db-fresh` to work, so that I can rebuild a
   branch's database from scratch in one command.
4. As a developer, I want database commands to run even when the application
   services are crash-looping, so that a bad migration is recoverable.
5. As a developer, I want a bad migration to stop the deploy with a named error,
   so that I do not have to infer the cause from three services crash-looping
   with the same stack trace.
6. As a developer, I want exactly one place that applies migrations, so that I
   never have to reason about which folder the migration table was built from.
7. As a developer, I want migrations to still apply automatically before the app
   starts, so that deploying does not acquire a manual step I can forget.
8. As a developer, I want every variable in `.env` to affect something, so that
   editing it has predictable consequences.
9. As a developer, I want `.env.example` to describe which execution context each
   variable serves, so that I do not have to read `docker-compose.yml` to find
   out whether a value is used.
10. As a developer, I want variables that reach no container removed rather than
    corrected, so that the file cannot mislead the next reader the way it
    misled the last one.
11. As a developer, I want to reach Postgres from a GUI client or `psql` on the
    host, so that I can inspect data without going through a container.
12. As a developer, I want `make db-create-migration` to keep running on my
    machine, so that a new migration file lands in my working tree where I can
    edit and commit it.
13. As a developer, I want the Makefile to say which targets touch the database
    and which are only codegen, so that the one host-side target does not read
    as an oversight.
14. As a developer, I want targets that operate on Postgres itself to keep using
    the running database container, so that connecting, dumping and restoring do
    not gain unnecessary indirection.
15. As a developer, I want application startup commands to do one thing, so that
    reading them tells me what a service is without also describing schema
    management.
16. As a developer, I want `api` to remain free of Postgres credentials, so that
    the least-privilege property established by the compose refactor survives
    this change.
17. As a developer, I want a missing Elasticsearch address to fail immediately
    and by name, so that a misconfiguration does not present as an unresolvable
    hostname.
18. As a developer, I want a hand-run migration or rollback command to fail with
    a missing-script error, so that the second authority cannot be reached by
    accident on a machine where the default port happens to be listening.
19. As a developer, I want the reasoning behind the single-authority design
    recorded, so that a future contributor does not reintroduce host-side
    database scripts as a convenience.
20. As a developer, I want the uncommitted compose refactor committed as part of
    this work, so that the repository stops carrying an unexplained working-tree
    change.
21. As an operator deploying to the server, I want the same compose file to
    behave identically there, so that a change verified locally needs no
    translation to be trusted in production.

## Implementation Decisions

### A dedicated migrator service owns the migration table

A new `migrator` service is added, built from the same build definition and
image tag as the application services, receiving only the database environment
fragment. It runs the compiled migration entrypoint and exits. It carries no
`container_name`, because one-off containers must not claim a fixed name.

```yaml
  migrator:
    build: *app-build
    image: saythis-app:latest
    environment:
      <<: *db-env
    restart: "no"
    command: node dist/src/db/scripts/run-migrations.js
    depends_on:
      db:
        condition: service_healthy
```

The three services that currently migrate at boot — `bot`, `scraper`,
`sync-elastic` — gain a dependency on its successful completion, keeping their
existing database-health dependency:

```yaml
    depends_on:
      db:
        condition: service_healthy
      migrator:
        condition: service_completed_successfully
```

Both paths were verified against real Compose during specification. On success
the gated service starts only after the migrator exits zero; on failure Compose
reports `service "migrator" didn't completed successfully: exit 1` and the gated
service never starts.

`api` is not gated and gains nothing. It reads Elasticsearch only and has no
Postgres dependency to preserve.

The migrator is deliberately **not** placed behind a Compose profile. It has a
production job now, so it must run on a normal bring-up. Manual invocations
override its command instead.

### Application start scripts stop managing schema

The three start scripts drop their migration prefix and become a single
`node dist/src/main-*.js` invocation each. This is the change that makes the
single-authority property real rather than conventional: as long as an
application service can migrate, a second authority exists.

### Manual database operations run as throwaway containers

`db-migrate`, `db-rollback` and `db-fresh` are re-pointed at
`docker compose run --rm migrator <compiled entrypoint>`. This was chosen over
`docker exec` into an application container for three reasons: it does not
require any application service to be running, it honours the migrator's
database-health dependency, and it executes the same compiled output the
deploy-time run uses. Compose accepts `run` against a service even when a fixed
container name is declared elsewhere in the file, and overrides the declared
command — both confirmed against this project's compose file.

Introducing parallel compiled-path npm scripts was rejected — they would exist
solely to be called by `make`, where naming the compiled entrypoint directly is
clearer about which artifact runs.

### The host-side migration scripts are deleted, not merely bypassed

Re-pointing the `make` targets leaves the npm scripts that replay migrations,
roll them back and seed the development database with no caller anywhere in the
repository — the Makefile was their only consumer. They are deleted rather than
left in place, because leaving them keeps the second authority one command away.

This is not a tidiness argument. Removing the database host and port variables
does **not** disable the host-side route; it makes it silent. The pool is
constructed with `host` and `port` read straight from the environment, so an
undefined host falls through to the driver's `localhost` default and a
non-numeric port coerces to `5432` — which is exactly what the compose file
publishes. Verified during specification: with both variables unset, a
host-side run connects successfully to the real development database. A
developer running the rollback script by hand would replay the working tree
against the live migration table and see it succeed.

Worse, whether it succeeds depends on what happens to be listening on the
default port at the time — the same command silently doing real work on one
machine and failing on another, which is the class of defect this spec exists to
remove.

Deleting the scripts converts the single-authority property from a convention
into a structural fact: the command fails with a missing-script error instead of
quietly rolling back a migration. The migration-creation script keeps its npm
entry, because it is host-side codegen and still has a caller.

The underlying TypeScript modules are untouched. The migrator runs their
compiled output, and the planned test harness imports the migration logic as a
function rather than through an npm alias, so only the aliases are removed.

### `db-create-migration` stays on the host

It writes a template file and never opens a database connection, so it is
codegen rather than a database operation and is unaffected by the migration
authority. Moving it into a container would require parameterising its output
directory, bind-mounting the working tree at a path that does not shadow the
compiled migrations, and using a one-off container rather than the running one —
all so that a file write happens somewhere other than the machine that will
immediately edit and commit the result.

The Makefile gains section headers separating container-side database
operations from host-side codegen, so the asymmetry reads as a decision.

`db-connect`, `db-export`, `db-restore`, `db-reset` and `db-load-dump` continue
to exec into the running database container. They target Postgres itself, which
is the one service with an always-restart policy.

### Environment variables are reduced to those with a consumer

`DB_HOST`, `DB_PORT` and `ES_NODE` are removed from `.env.example` and from the
developer's `.env`. Compose does not interpolate them, and after this change no
host-side command reads them. They are deleted rather than corrected, because a
correct-looking value in a file that feeds nothing is what produced the original
confusion.

`STOP_GRACE_PERIOD` is removed for the same reason: it appears in
`.env.example` and is referenced nowhere in `docker-compose.yml`, in either the
committed or working version.

Nothing is added to replace them. Making the published host port configurable
was considered and deferred — see Out of Scope. Published ports stay literals in
the compose file, so `.env` gains no variable whose meaning depends on which
side of the network boundary reads it.

The Elasticsearch address stays a hardcoded anchor shared by the application
services and Kibana. It is internal wiring between services in one file, not
configuration: it does not vary per environment, and moving it to `.env` would
recreate the exact dual-context defect this spec removes, since the Makefile
exports `.env` into host commands. Compose cannot interpolate a service name in
any case — only values and network aliases.

### The Elasticsearch fallback is removed

The captions service currently defaults its Elasticsearch address to the
in-network URL when the variable is unset. Compose sets that variable explicitly
for every service that needs it, so the fallback never fires in the case it was
written for and only fires when something is genuinely misconfigured — where it
produces an unresolvable hostname instead of a named error. A missing value
should fail loudly.

### Sequencing

The uncommitted compose refactor already in the working tree is committed as
part of this effort rather than separately: it introduced the environment
fragments and anchors that these changes build on.

## Testing Decisions

**No automated tests are added for this change.** This is a deliberate decision
by the developer, recorded here with its tradeoff rather than argued.

A good test here would assert external behaviour, not structure — and the
external behaviour of this change is almost entirely the resolved deployment
configuration rather than the behaviour of any module. Barely anything in the
application source changes.

The seam that was considered and rejected was the fully resolved Compose model,
obtained by rendering the configuration to JSON and asserting against it. It was
attractive because it is the highest available seam and sits exactly where the
original defect lived: after interpolation, anchor expansion and merge
resolution, which is where a variable that appears wired but reaches nothing
becomes visible. Testing the raw YAML would miss the defect entirely, and
testing a running stack would mostly re-test Compose. It was also cheap enough
for the pure suite — rendering the configuration was measured at roughly a
tenth of a second and confirmed to succeed with an unreachable Docker daemon,
so it would have needed only the Docker CLI and not the `.db.test.ts` suffix
that ADR-0002 reserves for container-backed tests.

The properties it would have pinned, and which are now unenforced:

- exactly one service replays migrations, and the application services are gated
  on its successful completion
- no service's environment carries a value sourced from `.env` for the three
  removed variables
- `api` receives no Postgres credentials

The consequence is that the single-authority property rests on the shape of the
configuration rather than on anything that checks it. Deleting the host-side
scripts makes the property structural for the route that exists today, but a
future change that reintroduces a migration call into an application start
script, restores one of the deleted npm scripts, or adds `env_file` to a service
will not fail anything — and per ADR-0003 there is no CI that would catch it
either. The Implementation Decisions above are the only record of why those
shapes are wrong.

Verification is manual: bring the stack up and confirm the migrator runs to
completion before the application services start, and confirm a rollback
succeeds while the application services are stopped.

Prior art, had a test been written: `.scratch/postgres-test-harness/` describes
the suite's structure and the suffix convention that separates pure tests from
container-backed ones.

## Out of Scope

- **`make search` and the missing captions script.** The target invokes an npm
  script that does not exist and never has, and no command-line entrypoint for
  caption search exists anywhere — only a use case consumed by the Telegram
  controller and the API server. Fixing it means either writing a CLI entrypoint
  or deleting the target and the comment that references it. That is a genuine
  product decision and has not been made.
- **Startup environment validation.** Missing database variables do not fail
  fast: the pool is lazy, an undefined host falls through to the driver's
  `localhost` default, and a non-numeric port coerces to `5432`. Depending on
  what is listening there, the result is either a connection error that
  misdirects toward "is Postgres down?" or — as verified while writing this spec
  — a *successful* connection to a database nobody intended to reach. Validating
  configuration at startup would convert both outcomes into an immediate named
  error, and valibot is already a dependency. Deleting the host-side scripts
  removes the specific route this spec cares about, but the silent-default
  behaviour remains anywhere else the pool is constructed. Discussed, not
  begun.
- **Making the development Dockerfile usable.** It never compiles, and the
  compiled output is excluded from the build context, so the development image
  cannot boot the application services — which is why the production image is
  what runs locally. Fixing it with a source bind-mount would give both an
  instant migration loop and a single authority, which is the change that would
  genuinely improve the authoring experience this spec only makes safe. It is a
  larger piece of work.
- **A configurable published database port.** The host port Postgres is
  published on stays a literal. Making it a variable was considered — it is the
  one fact that genuinely varies per machine, and interpolating it into the port
  mapping alone would keep a single meaning and a single consumer, unlike the
  variables this spec removes. Deferred because there is one developer and no
  port conflict. A second contributor whose port is occupied would have to edit
  the compose file, which is the point at which this should be revisited.
- **Expand/contract as a practice, and a target for one-off data tasks.**
  Running a backfill or an index build outside the boot gate needs its own
  target, because the gate holds every application service down until it exits
  and Kysely wraps each migration in a single transaction on Postgres — which
  also means `CREATE INDEX CONCURRENTLY` cannot be a migration at all. Deferred:
  nothing currently needs it, and the migrator service makes it a one-line
  addition when something does.
- **Zero-downtime deployment.** Bringing the stack up still takes downtime while
  the migrator runs.
- **The remaining findings from the originating review**, none of which are
  touched here: the Elasticsearch sync service exiting on a heap exhaustion
  during sync; only the database service having a restart policy; Elasticsearch
  having no healthcheck, so dependents gate on start rather than readiness; the
  Docker ignore file not excluding `.env`; and the scraper running without its
  VPN because the credentials are unset and the entrypoint skips silently.

## Further Notes

Kysely takes a transaction-level advisory lock before migrating, so the current
arrangement of three services migrating concurrently is not a data race — they
serialise, and the losers find nothing pending. Consolidating to one migrator is
about having a single authority and a single failure point, not about
correctness under concurrency.

The migration-validation behaviour this spec is built around is the same one
ADR-0002 already had to solve for the test harness, which names base databases
after a hash of the migrations folder so that a branch switch selects a
different database rather than corrupting an existing one. A development
database has no equivalent protection: switching between branches whose
migrations differ will eventually require resetting it. If that becomes a
recurring cost, applying the same hashing idea outside the test harness is the
obvious follow-up.

Worth confirming during implementation: when nothing has changed, a repeat
bring-up may leave a previously-exited migrator container in place and satisfy
the completion condition from that earlier exit rather than replaying. This is
harmless — there is nothing pending — but the behaviour should be observed
rather than assumed, particularly after an image rebuild.

Two of the three broken targets have been failing since the production image
became the default local image, and the third has never worked. None of it was
noticed because the containers themselves run correctly; the failures are
confined to manual operations that are used rarely. That is the argument for
recording the invariants somewhere durable given that, per the testing decision
above, nothing will enforce them.
