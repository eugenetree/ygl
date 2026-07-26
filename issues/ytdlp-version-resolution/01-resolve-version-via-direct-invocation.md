# Resolve yt-dlp version via direct --version invocation

**Type:** AFK

## Parent

PRD: `docs/prd/prd-ytdlp-version-resolution.md`

## What to build

Make the scraper's startup log report the real `yt-dlp` version instead of always
`unknown`.

`YtDlpClient.getVersion()` currently calls the `ytdlp-nodejs` wrapper's
`getVersionAsync()`, which is broken in v3.4.4: it invokes the binary with an empty URL
plus `--version`, but the wrapper's arg builder throws `"URL is required."` on an empty
URL — even when no URL is needed for a version query. So version resolution can never
succeed, the warning `Failed to resolve yt-dlp version: URL is required.` is logged, and
the startup line reads `yt-dlp version: unknown`.

Rewrite `getVersion()` to resolve the version by invoking the yt-dlp binary directly
with `--version` (via `child_process`), reading and trimming stdout — bypassing the
broken wrapper method. Use the *same* binary the scraper runs extractions with (in the
scraper image the Dockerfile symlinks `node_modules/ytdlp-nodejs/bin/yt-dlp` →
`/usr/local/bin/yt-dlp`, so `yt-dlp` resolves on `PATH`); prefer the wrapper's exposed
binary path if cleanly available, otherwise fall back to `yt-dlp` on `PATH`. Do not
hardcode an absolute path.

Keep resolution non-fatal and off the critical boot path: wrap it in try/catch with a
short timeout so a wedged binary can't stall startup, and on any failure log a warning
and return `undefined` (which `main-scraper.ts` already renders as `unknown`). Signature
stays `Promise<string | undefined>`; `main-scraper.ts` is unchanged. Add a brief comment
explaining why the wrapper's `getVersionAsync()` is bypassed so it isn't "simplified"
back.

## Acceptance criteria

- [ ] On scraper boot the log reads `yt-dlp version: <real version>` (e.g. a `YYYY.MM.DD` string), and the `Failed to resolve yt-dlp version: URL is required.` warning no longer appears.
- [ ] The reported version comes from the same binary used for extraction (PATH `yt-dlp` / the wrapper's configured binary), not a hardcoded absolute path.
- [ ] `getVersion()` retains its `Promise<string | undefined>` signature; `main-scraper.ts` is not modified and still renders `?? "unknown"`.
- [ ] Resolution is bounded by a timeout and wrapped in try/catch: a missing, broken, or hanging binary results in `unknown` and never crashes or stalls startup.
- [ ] A code comment records why the wrapper's `getVersionAsync()` is not used.
- [ ] If the `--version` output parsing is factored out from the spawn, a small unit test asserts a sample `--version` stdout is trimmed/parsed correctly (`node:test` + `node:assert/strict`, run via `npm test`). Exhaustive mocking of the spawn itself is not required.

## Blocked by

None - can start immediately.
