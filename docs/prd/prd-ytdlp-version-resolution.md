# PRD: Resolve the real yt-dlp version on startup (`unknown` fix)

## Problem Statement

On every scraper boot, the startup logs report:

```
[main-scraper:yt-dlp-client] Failed to resolve yt-dlp version: URL is required.
[main-scraper] yt-dlp version: unknown
```

The version-logging feature (added so operators can confirm which `yt-dlp` build is
running — important because YouTube breakage is very often "the pinned yt-dlp is stale")
**never works**: it always logs `unknown`. This defeats the entire purpose of the
feature — when yt-dlp starts failing to extract videos, the one diagnostic that would
tell us "we're on an old binary, bump it" is permanently blank.

The root cause is a bug in the `ytdlp-nodejs` library (v3.4.4), not in our call site.
Our `getVersion()` correctly calls the wrapper's `getVersionAsync()`, but internally
that method does:

```js
// ytdlp-nodejs@3.4.4
getVersionAsync() { return (await this.execAsync("", { printVersion: true })).output.trim() }
```

It passes an **empty URL** together with `--version`. But the wrapper's argument
builder unconditionally rejects an empty URL, even when no URL is needed:

```js
buildBaseArgs(t = []) { if (!this.videoUrl) throw new Error("URL is required."); ... }
```

So `getVersionAsync()` throws `"URL is required."` before it can ever run
`yt-dlp --version`. Our `getVersion()` catches it, warns, and returns `undefined`,
which surfaces as `yt-dlp version: unknown`.

## Solution

Resolve the yt-dlp version by invoking the yt-dlp binary directly with `--version`,
bypassing the broken `getVersionAsync()` wrapper method. The startup log should show
the real version string (e.g. `2025.xx.xx`) instead of `unknown`, while remaining
non-fatal: if resolution genuinely fails, it still degrades gracefully to `unknown`
and never blocks scraper startup.

## User Stories

1. As a scraper operator, I want the boot log to show the actual `yt-dlp` version, so
   that when extraction starts failing I can immediately see whether the binary is
   stale and needs bumping.
2. As a scraper operator, I want a genuinely broken/missing binary to still log
   `unknown` rather than crash the scraper on startup, so that version resolution is
   never on the critical path to running.
3. As a developer, I want version resolution to not depend on the `ytdlp-nodejs`
   wrapper method that is broken for version queries, so that a library that can't run
   `--version` without a URL doesn't leave us permanently blind.
4. As a developer, I want the fix to reuse the same binary the scraper actually runs
   extractions with, so that the reported version is the version in use — not some
   other yt-dlp that happens to be on the machine.
5. As a future maintainer, I want a note explaining *why* we bypass `getVersionAsync()`,
   so that nobody "simplifies" the code back to the broken wrapper call.

## Implementation Decisions

- **Change site**: `YtDlpClient.getVersion()` (`src/modules/youtube-api/yt-dlp-client.ts`).
  Keep its signature (`Promise<string | undefined>`) and its existing try/catch →
  `undefined` fallback behavior. `main-scraper.ts` continues to render
  `?? "unknown"`; no change there.
- **Approach**: invoke the yt-dlp binary directly with `--version` (e.g. via
  `child_process`), read stdout, and trim it — instead of calling
  `this.ytdlp.getVersionAsync()`.
- **Which binary**: the same one the scraper runs. In the scraper image the Dockerfile
  symlinks `node_modules/ytdlp-nodejs/bin/yt-dlp` → `/usr/local/bin/yt-dlp`, so
  `yt-dlp` resolves on `PATH`. Preferred: resolve the wrapper's configured binary path
  if it's cleanly exposed; otherwise fall back to invoking `yt-dlp` from `PATH`. The
  decision to be finalized during implementation is which of those is more robust
  across dev (Windows/local) and prod (alpine container) — but it must be the binary
  actually used for extraction, not a hardcoded absolute path.
- **Non-fatal & bounded**: resolution stays inside a try/catch and should not hang
  startup — a short timeout on the child process is acceptable so a wedged binary
  can't stall boot. On any failure it logs a warning and returns `undefined`.
- **No upgrade of `ytdlp-nodejs`** is assumed. If a newer version fixes
  `getVersionAsync()` we could revert to it later, but this PRD does not depend on or
  require a library bump.
- **No ADR** — small, low-risk, self-contained fix.

## Testing Decisions

- This is thin glue around spawning an external binary, so heavy unit testing has low
  value. If the version resolution is refactored so the "parse the `--version` output"
  step is separable from the spawn, a small unit test asserting that a sample
  `--version` stdout string is trimmed/parsed correctly is worthwhile; the spawn itself
  is not worth mocking exhaustively.
- Manual/verification acceptance: on scraper boot the log reads
  `yt-dlp version: <real version>` and the `Failed to resolve yt-dlp version: URL is
  required.` warning is gone.
- **Prior art**: existing tests use plain `node:test` + `node:assert/strict` via
  `npm test`; follow that convention for any added unit test.

## Out of Scope

- Upgrading, pinning, or auto-updating the `yt-dlp` binary itself (this PRD only
  *reports* the version; acting on a stale version is separate).
- Filing/patching the upstream `ytdlp-nodejs` `getVersionAsync()` bug.
- The separate Telegram-notification-failure diagnostics work (its own PRD).
- Surfacing the version anywhere other than the existing startup log line
  (e.g. Telegram, health endpoints, DB).

## Further Notes

This bug rode in with the "log yt-dlp version on startup" feature (commit `97d3601`):
the feature has been emitting `unknown` since it was added, because the wrapper method
it relies on cannot run `--version` without a URL. The scraper otherwise runs yt-dlp
fine (extractions work), which confirms the binary itself is healthy — only the
*version query path* through the wrapper is broken.
