---
name: prod
description: Read-only SSH access to the production server — container state and logs, database rows, Elasticsearch indices, and the raw yt-dlp responses of the last 14 days. Use when investigating a "Scraper failure" alert, what yt-dlp returned for a video, or any question only what is actually running in production can answer.
---

# Prod

Production runs on `root@178.105.4.165`, deployed by Dokploy from `docker-compose.yml`. You are an **observer** there: you read state, and every change belongs to the user.

Root means nothing on the server stops a destructive command. The allowlist below is the guardrail.

## Connecting

Run each command as one non-interactive call from the Bash tool:

```bash
ssh -o BatchMode=yes root@178.105.4.165 '<command>'
```

Start with `docker ps -a` to confirm the container names (`db`, `api`, `bot`, `scraper`, `sync-elastic`, `elasticsearch`, …) before addressing one.

## Allowlist

Run only commands of these shapes. Everything else goes to **Handing over**.

**Host** — `ls`, `cat`, `zcat`, `head`, `tail`, `grep`, `find` (with read-only predicates), `wc`, `df -h`, `du -sh`, `free -h`, `uptime`, `ps aux`, `top -bn1`, `journalctl --no-pager` with `-n` or `--since`. App logs live in `/opt/ygl/logs`.

**Docker** — `docker ps -a`, `docker logs --tail <n>` or `--since <t>` (always bounded), `docker inspect --format '<template>'`, `docker stats --no-stream`, `docker top <c>`, `docker images`, `docker system df`, `docker compose ls`.

**Postgres** — through `db` in a session that refuses writes and long queries, SQL on stdin:

```bash
ssh -o BatchMode=yes root@178.105.4.165 'docker exec -i -e PGOPTIONS="-c default_transaction_read_only=on -c statement_timeout=30s" db sh -c "psql -v ON_ERROR_STOP=1 -U \"\$POSTGRES_USER\" -d \"\$POSTGRES_DB\""' <<'SQL'
SELECT ...;
SQL
```

Only `SELECT`, `EXPLAIN` (without `ANALYZE`), and `\d`-style catalog reads. Give every query over a big table a `LIMIT` or an aggregate.

**Elasticsearch** — `curl -s -XGET` against `localhost:9200` on the host: `_cat/*`, `_cluster/health`, `<index>/_mapping`, `<index>/_count`, `<index>/_search` with a JSON body and a `size`.

**yt-dlp responses** — the scraper keeps what `yt-dlp --dump-json` returned for every video it fetched in the last 14 days, in the `scraper` container's volume, whose host path is `docker inspect --format '{{range .Mounts}}{{.Source}}{{end}}' scraper`. One gzipped JSON line per fetch at `<YYYY-MM-DD>/<HHMMSS>_<videoId>.json.gz` (UTC): `{ videoId, fetchedAt, result }`, where `result` is `{ ok: true, value: [<yt-dlp JSON>] }` or `{ ok: false, error }` with yt-dlp's stderr in `error.message`. The host has no `jq`, so pull the files still gzipped and parse them locally: `ssh … 'cat <dir>/<day>/*.json.gz' | gunzip` gives one fetch per line.

To trace one video, `ls <dir>/*/*_<videoId>.json.gz` lists every fetch of it still on disk. No match means the fetch is past retention or wasn't a `getVideo` metadata fetch; caption downloads aren't recorded. A failed fetch's record holds the same stderr the alert showed. What it adds is `fetchedAt`, which bounds `docker logs scraper --since … --until …`, and the video's other fetches, which show what it looked like when it last worked.

## Credentials

Production credentials stay off the transcript entirely — this is a hard guardrail that overrides the allowlist. Every allowlist command is aimed at state, never at:

- environment variables — `env`, `printenv`, `/proc/*/environ`, `docker inspect` on `.Config.Env`, `docker exec … env`
- `.env` files, compose files with values filled in, and Dokploy's stored config
- keys and tokens — `~/.ssh`, certificates, anything named `*secret*`, `*token*`, `*key*`, `*password*`
- the database's auth data — `pg_authid`, `pg_shadow`, `sessions.token`, `accounts.accessToken`/`refreshToken`/`idToken`/`password`, `verifications.value` (so name columns in a `SELECT` on those tables, never `*`)

The Postgres command above stays inside the guardrail: `$POSTGRES_USER` expands inside the container and never prints. When a task needs a credential's value, hand it over like a change, below.

## Handing over

When the work needs a change on prod — restart, deploy, migration, a write to the database or index, editing or deleting a file, killing a process, pruning — stop and give the user:

- the exact command,
- what it changes and what you expect it to fix,
- how to check it worked.

The user runs it, with `! ssh root@178.105.4.165 '...'` if they want the output here.

**Done when:** every command you ran on prod matches an allowlist shape, and anything beyond it is in front of the user as a handover.
