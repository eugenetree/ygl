# 01 — Land the compose refactor and drop the unreferenced grace-period variable

**What to build:** The repository stops carrying an unexplained working-tree
change. The compose refactor already sitting uncommitted — top-level environment
fragments replacing the anchor that lived inside the bot service, a shared
Elasticsearch URL anchor used by both the application services and Kibana, each
service receiving only the variables its import graph actually reads, build
blocks on the API and Elasticsearch-sync services so neither depends on the bot
having been built first, and Kibana's environment in mapping form so the alias
resolves — is committed with a message explaining those decisions.

The example environment file also loses `STOP_GRACE_PERIOD`, which is referenced
nowhere in the compose file, in either the committed or working version. It is
the same class of defect as the variables the later tickets remove — a value
that looks like configuration and reaches nothing — and it is safe to remove
now because nothing has ever read it.

This is a prefactor. Everything after it edits the same file and builds on the
fragments and anchors it introduces.

**Blocked by:** None — can start immediately.

**Status:** ready-for-human

- [x] The compose refactor in the working tree is committed, with a message that explains why each service's environment was narrowed rather than only what changed
- [x] The unreferenced grace-period variable is removed from the example environment file
- [x] The commit changes no rendered configuration — the resolved services and their environments are identical before and after
- [x] The API service still receives no Postgres credentials
- [x] The stack comes up and every service reaches its normal running state
- [x] The working tree is clean afterwards

## Comments

The compose refactor was already committed before this ticket was picked up
(`22ddb70`, and `a8ff657` for the Dockerfile rename), so the only remaining work
was removing `STOP_GRACE_PERIOD` from `.env.example` — committed as `6286c60`.

"Every service reaches its normal running state" was verified on a clean volume
in a throwaway Compose project (`-p yg-verify`), where all seven services came
up. It is *not* currently true of the developer's own database: it has migration
`1778800000000-video-jobs-channel-id-status-index` applied (from commit
`74bb995`, which is not on this branch), so the migrator correctly refuses with
`corrupted migrations`. That drift predates this work. `make db-fresh` is the
fix, and was deliberately not run because it destroys development data.
