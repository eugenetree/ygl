# 04 — Remove the host-side migration route

**What to build:** Running a migration or rollback by hand from the host stops
being possible, so the single-authority property becomes structural rather than
a convention.

After the previous ticket, the npm scripts that replay migrations, roll them
back and seed the development database have no caller anywhere in the
repository. Deleting them matters more than tidiness: removing the database host
and port variables does **not** disable the host-side route, it makes it silent.
The pool reads host and port straight from the environment, so an undefined host
falls through to the driver's `localhost` default and a non-numeric port coerces
to `5432` — which is what the compose file publishes. Verified during
specification: with both variables unset, a host-side run connects successfully
to the real development database. A developer running the rollback script by
hand would replay the working tree against the live migration table and see it
succeed.

With the scripts gone, the same command fails with a missing-script error
instead. The migration-creation script keeps its npm entry — it is host-side
codegen and still has a caller. The TypeScript modules behind all of them stay:
the migrator runs their compiled output, and the planned test harness imports
the migration logic as a function rather than through an npm alias.

The environment variables that reach no container go at the same time, since
this is the ticket that removes their last would-be reader. The captions service
also stops defaulting its Elasticsearch address to the in-network URL — Compose
sets that variable explicitly for every service that needs it, so the fallback
never fires in the case it was written for and only fires when something is
genuinely misconfigured, where it yields an unresolvable hostname instead of a
named error.

**Blocked by:** 03 — the make targets must stop calling these scripts first.

**Status:** ready-for-human

- [x] The migration-run, rollback and dev-seed npm scripts are deleted
- [x] The migration-creation npm script remains
- [x] A hand-run rollback fails with a missing-script error rather than connecting
- [x] The TypeScript modules behind the deleted scripts are untouched and the migrator still runs their compiled output
- [x] The database host, database port and Elasticsearch address variables are removed from the example environment file, and from the developer's own environment file
- [x] The example environment file states which execution context each remaining variable serves
- [x] The captions service no longer falls back to the in-network Elasticsearch address
- [x] The API still serves caption search, and the Elasticsearch-sync service still syncs
- [x] A full bring-up from a clean state applies migrations and starts every service

## Comments

`npm run db:migration:rollback` now fails with npm's missing-script error.
`db:migration:create-new` still works from the host.

A full bring-up from a clean state was verified in a throwaway Compose project:
migrator exited 0 and all seven services reached running. Caption search was
verified end to end — a document indexed directly into Elasticsearch came back
through `GET /api/search?q=…` — which also confirms the removed `ES_NODE`
fallback is unnecessary: the variable is set for every service that reads it.
`sync-elastic` completed a full sync cycle cleanly (0 captions, because the dev
fixtures contain none in a syncable state).

Left alone deliberately: `R2_BUCKET` and `R2_FOLDER` in `.env.example` are the
same class of defect as the variables this ticket removes — `r2-download-latest`
hardcodes the bucket and folder path and reads neither. Out of this spec's
stated scope, so flagged rather than changed.
