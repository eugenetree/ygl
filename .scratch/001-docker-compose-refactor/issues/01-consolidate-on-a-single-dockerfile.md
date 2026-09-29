# 01 — Consolidate on a single Dockerfile

**What to build:** A developer can clone the repo, run `docker compose build`
with nothing set in their shell, and get an application image that actually
runs. Today that command silently builds from `Dockerfile.dev`, which never
compiles TypeScript while every start script runs `node dist/…`, so the image
exits immediately on every service. The containers currently running were built
with `DOCKERFILE=Dockerfile.prod` supplied out of band, which means the image a
machine produces depends on a shell variable rather than on the commit.

After this ticket there is one application Dockerfile, compose names it
directly, and the `DOCKERFILE` indirection is gone from both compose and
`.env.example`. If a development image is ever wanted it should be a
multi-stage target in the same file, not a second file.

`Dockerfile.scraper` is a separate image with its own build and is not touched.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] `Dockerfile.dev` is deleted
- [ ] `Dockerfile.prod` is renamed to `Dockerfile`, moved so that
      `git log --follow Dockerfile` shows the history of the file it came from
- [ ] Compose builds the application image from `Dockerfile` with no environment
      variable involved in choosing it
- [ ] `DOCKERFILE` is removed from `.env.example`
- [ ] `docker compose build` with `DOCKERFILE` unset in the shell succeeds, and
      the resulting image starts `bot` and keeps it running — the case that
      produces a dead container today
- [ ] `Dockerfile.scraper` is unchanged and still builds

**Verification note:** `docker compose build` with `DOCKERFILE` unset succeeds and
the image starts `bot` and keeps it running. On macOS the `bot` service needs a
local override swapping compose's `/opt/ygl/logs` bind mount for `./logs` —
Docker Desktop does not share `/opt`, so `docker compose up bot` fails with
`Mounts denied` before the image is ever reached. That is a pre-existing defect
in the compose file (a server path hardcoded as a host mount), unrelated to this
ticket and not covered by 02 or 03.
