# Local Database Strategy

## The governing rule: local DB is rebuildable derived state

The local database is a function of `(current branch's migrations) + (seed)`. It is not precious — recreate it rather than trying to keep it in sync across branch switches.

When you see Kysely's "corrupted migrations" / out-of-order error, that is the correct signal that the DB no longer matches the checked-out branch. The response is:

```
make db-fresh
```

Not: hand-patching the `kysely_migration` table.

## Rebuild at branch boundaries, not across them

Migrating a DB that was on `branch-A` up to `branch-B` works only when `branch-B`'s migration folder is a strict superset of `branch-A`'s. When two unmerged feature branches each add different migrations, switching between them leaves the DB in an inconsistent state. Rebuild instead.

`make db-fresh` = drop → migrate → seed dev fixtures in one command.

## Restarts do not recreate the database

Postgres data lives in a Docker volume. Running `make up`, `make down`, restarting the app container, or running `npm run start:*` all preserve the volume. Data loss is always an explicit act:

- `make db-fresh` — drops and rebuilds the DB (but not the volume)
- `docker compose down -v` (`make rebuild-fresh`) — wipes the volume entirely

## Two-track data strategy

### Track 1: minimal seed (fast inner loop)

**When to use:** "Is my logic correct? Does the pipeline wire together?"

`make db-fresh` gives you a small, referentially-complete slice: 10 channels, 10 videos covering all caption-status combinations, full upstream and downstream chains (queries → discovery jobs → channel entries → jobs → videos → video entries → video jobs → captions → priority scores), plus deliberately synthetic edge-case rows.

This answers correctness questions cheaply.

### Track 2: production dump (scale and shape verification)

**When to use:** "Does it survive prod scale, distribution, and unknown edge cases?"

Use the existing `Makefile` targets:

```
make r2-download-latest   # download latest dump from Cloudflare R2
make db-restore file=db/dump/<filename>
make db-migrate           # apply branch migrations on top
```

The prod dump path is safe: a feature branch's migration folder is always a superset of what the dump was created from, so `db-migrate` applies only the new migrations.

### Which features warrant a prod-dump dry run

Run against a prod dump before merging if your change involves any of:

- **Migrations on large tables** — `videos`, `captions`, `channelJobs`, `videoJobs` have millions of rows; column additions, index creations, and type changes need timing verification.
- **Queries that scan, sort, aggregate, or join** — `EXPLAIN ANALYZE` on the prod dump is the only way to catch missing indexes or bad query plans.
- **Batch loops over many rows** — any code that iterates over all channels, all videos, or all captions at once; the minimal seed has at most ~40 rows and won't reveal memory pressure or timeout behaviour.

The minimal seed is deliberately *not* grown toward prod-realistic volume — that is structurally the dump track's job.

## Known edge cases vs unknown edge cases

| Class | Where it belongs |
|---|---|
| Known edge case (e.g. channel with no videos, video with null fields) | Seed row + hermetic test |
| Unknown edge case / performance characteristic | Prod-dump dry run |

The dev fixture seed encodes the known edge cases permanently. The prod-dump dry run discovers what you didn't know to look for.
