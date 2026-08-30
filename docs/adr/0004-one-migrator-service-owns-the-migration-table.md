# One migrator service owns the migration table

Migrations are applied by exactly one thing: the `migrator` service in
`docker-compose.yml`. It runs the application image's compiled output, replays
migrations to completion and exits. `bot`, `scraper` and `sync-elastic` wait for
it via `condition: service_completed_successfully` and no longer migrate at
boot. Manual work — `make db-migrate`, `make db-rollback`, `make db-fresh` —
runs that same service as a throwaway one-off container.

There is deliberately **no host-side route**. The npm scripts that replayed
migrations, rolled them back and seeded the development database were deleted,
not merely bypassed. Running one by hand now fails with a missing-script error.

## Why

Kysely validates the migrations folder against `kysely_migration` on every call,
up and down, and hard-throws `corrupted migrations: previously executed
migration X is missing` when they disagree. One table, two folders — the working
tree and the image's `dist` — is a hard failure on any branch that has added or
removed a migration since the image was built.

Deleting the host-side scripts is what makes single-authority structural rather
than conventional. It is not tidiness: the pool reads `host` and `port` straight
from the environment, so an undefined host falls through to the driver's
`localhost` default and a non-numeric port coerces to `5432` — which is exactly
what Compose publishes. Verified while specifying this: with both variables
unset, a host-side run connects successfully to the real development database.
So the second authority did not fail loudly when its configuration was removed;
it silently did real work on the live database, and whether it did depended on
what happened to be listening on the default port.

Running manual work as a one-off container rather than `docker exec` also breaks
a circular failure: a bad migration crash-loops the application services, and
the rollback that fixes it used to be an exec into one of them.

## Considered alternatives

- **Keep migrating at boot in each service** — Kysely takes a transaction-level
  advisory lock, so three concurrent migrators are not a data race. Rejected
  anyway: three services replaying the same migrations means three places a
  failure surfaces and no single authority over the table.
- **Compiled-path npm scripts for `make` to call** (`db:migration:run:dist`) —
  rejected. They would exist solely to be called by `make`, where naming the
  compiled entrypoint directly is clearer about which artifact runs, and they
  would reopen a host-side route by accident.
- **Put the migrator behind a Compose profile** — rejected. It has a production
  job now, so it must run on a normal `docker compose up`.
- **`docker exec` into an application container** — rejected. It requires an
  application service to be running, which is precisely what a bad migration
  prevents.
- **Correcting `DB_HOST`/`DB_PORT` in `.env` instead of deleting them** —
  rejected. Compose never interpolated them, so a correct-looking value in a
  file that feeds nothing is what produced the original confusion.

## Consequences

- Bringing the stack up takes downtime while the migrator runs. Zero-downtime
  deployment is not addressed here.
- A migration cannot use `CREATE INDEX CONCURRENTLY`: Kysely wraps each
  migration in a transaction on Postgres. A long backfill also should not be a
  migration, because the gate holds every application service down until the
  migrator exits. Both need a separate one-off target, which the migrator
  service makes a one-line addition when something needs it.
- `make db-create-migration` stays on the host. It writes a template file and
  opens no connection, so it is codegen; its output has to land in the working
  tree to be edited and committed. The Makefile's section headers say so.
- The dev seed fixtures now ship in the application image, because
  `make db-fresh` seeds from the compiled entrypoint and `tsc` does not emit
  `.json`.
- Nothing enforces any of this. Per ADR-0003 there is no CI, and no test asserts
  the resolved Compose model, so a change that reintroduces a migration call
  into a start script, restores a deleted npm script, or adds `env_file` to a
  service will fail nothing. This ADR is the record.

## When to reopen

If the development Dockerfile is made usable with a source bind-mount, the
authoring loop changes: migrations could run from the working tree inside the
container against the same table. That is the change that would make host-side
convenience unnecessary rather than merely unsafe, and it is the point at which
this should be revisited.
