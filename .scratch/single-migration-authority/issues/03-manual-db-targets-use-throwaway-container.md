# 03 — Manual database work runs in a throwaway migrator container

**What to build:** A developer can migrate, roll back and reseed the database
without any application service being alive. The migrate, rollback and
fresh-database targets stop exec-ing into the bot container and instead run a
throwaway migrator container, which builds from the image rather than attaching
to a running process.

This removes a circular failure: a bad migration crash-loops the application
services at boot, and the rollback command that fixes it is currently
implemented as an exec into one of them. It also means manual runs execute the
same compiled output as the deploy-time run, against the same migration table,
so the two cannot disagree.

The migration-creation target stays on the host. It writes a template file and
never opens a database connection, so it is codegen rather than a database
operation, and its output has to land in the working tree to be edited and
committed. The Makefile should say so with section headers, so the asymmetry
reads as a decision rather than an oversight.

Targets that operate on Postgres itself — connect, export, restore, reset, load
a dump — keep exec-ing into the database container. They target the one service
with an always-restart policy.

**Blocked by:** 02 — needs the migrator service to exist.

**Status:** ready-for-human

- [x] The migrate, rollback and fresh-database targets run in a throwaway migrator container naming the compiled entrypoint directly
- [x] Each succeeds while the bot, scraper and Elasticsearch-sync services are stopped
- [x] Each waits for the database to be healthy rather than assuming it is up
- [x] The migration-creation target still runs on the host and its output appears in the working tree
- [x] Targets operating on Postgres itself still use the running database container
- [x] The Makefile separates container-side database operations from host-side codegen with section headers
- [x] No make target invokes the working-tree npm database scripts any more
- [x] No parallel compiled-path npm scripts are introduced

## Comments

All three targets were run for real (against a throwaway Compose project, via
`COMPOSE_PROJECT_NAME`, so the developer's data was not touched) with `bot`
stopped: `make db-migrate` was a no-op on an already-migrated database,
`make db-rollback` rolled back the latest migration, and `make db-fresh` reset,
migrated and seeded successfully. `make db-create-migration` still writes into
the working tree.

One extra change this required: `tsc` does not emit `.json`, so the dev seed
fixtures were not in the image and `db-fresh` would have failed on a missing
fixtures directory. The Dockerfile now copies `src/db/fixtures` into
`dist/src/db/fixtures`, following the precedent already set in
`Dockerfile.scraper` for the channel-discovery data.

Noticed while verifying, not fixed: seeding a database the scraper has already
populated fails on a foreign key, because `seedDevFixtures` uses
`ON CONFLICT DO NOTHING` on `search_channel_queries` and the fixture rows it
skips are then referenced by `channel_discovery_jobs`. It only bites when
seeding on top of scraped data; `db-fresh` resets first, so its own path is
fine.
