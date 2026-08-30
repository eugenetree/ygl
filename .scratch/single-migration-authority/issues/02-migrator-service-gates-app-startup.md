# 02 — One migrator service applies migrations, and the app services wait for it

**What to build:** Migrations stop being replayed by three services at boot and
become the job of one. A dedicated migrator service, built from the same image
as the application services and receiving only the database environment, replays
migrations to completion and exits. The bot, scraper and Elasticsearch-sync
services start only once it has succeeded, and their start commands stop
managing schema entirely.

Deployment behaviour is unchanged in spirit — migrations still apply
automatically before the application runs — but one thing does it, so there is a
single authority over the migration table and a single place a migration failure
is reported.

The gating shape, confirmed against real Compose during specification:

```yaml
    depends_on:
      db:
        condition: service_healthy
      migrator:
        condition: service_completed_successfully
```

On success the gated service starts only after the migrator exits zero. On
failure Compose reports `service "migrator" didn't completed successfully:
exit 1` and the gated service never starts.

The migrator must **not** sit behind a Compose profile — it has a production job
now and has to run on a normal bring-up. It must not declare a fixed container
name, because later work invokes it as a throwaway container.

**Blocked by:** 01 — builds on the environment fragments and build anchors that
ticket commits.

**Status:** ready-for-human

- [x] A migrator service exists, built from the same image as the application services, and receives only the database environment
- [x] It declares no fixed container name and is not behind a profile
- [x] It waits for the database to be healthy before running
- [x] It replays migrations from the image's compiled output and exits
- [x] The bot, scraper and Elasticsearch-sync services start only after it completes successfully
- [x] Those three start commands no longer replay migrations
- [x] The API service is neither gated on the migrator nor given Postgres credentials
- [x] A deliberately failing migration stops the migrator non-zero, prevents the gated services from starting, and names the failing migration
- [x] Bringing an already-migrated stack up again is a no-op rather than an error
- [x] Behaviour after an image rebuild is observed rather than assumed — confirm whether a previously-exited migrator is replayed or its earlier exit satisfies the condition

## Comments

Verified against real Compose:

- **Success path** — `db` healthy → migrator runs → exits 0 → gated services
  start. Confirmed on a clean volume in a throwaway project.
- **Failure path** — observed for real rather than synthetically. The
  developer's database has a migration applied that is absent from this branch,
  so the migrator exited 1 naming it (`corrupted migrations: previously executed
  migration 1778800000000-video-jobs-channel-id-status-index is missing`),
  Compose reported `service "migrator" didn't completed successfully: exit 1`,
  and `bot`, `scraper` and `sync-elastic` all stayed in `created`. The exit-code
  mechanism is identical for a migration whose SQL fails, where
  `run-migrations.ts` prints `failed to execute migration "X"` before exiting 1.
- **Repeat bring-up** — Compose *restarts* the exited migrator rather than
  reusing its earlier exit, so it replays on every `up`. That is a no-op when
  nothing is pending. After an image rebuild the container is recreated, so the
  same replay happens.
- **Rendered config** — `docker compose config` before and after differs only by
  the new service and the three gates. `api` is untouched and still receives no
  Postgres credentials.
