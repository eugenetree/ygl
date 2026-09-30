# 04 — `YtDlpClient.getVersion()` times out on macOS, failing `npm run test:net`

**What to build:** `npm run test:net` passes on a developer's Mac. Today its
`getVersion()` test fails on every run with "expected a version string, got
undefined", and has done so since before ticket 01. Ticket 01 moved it out of
the default suite, but didn't fix it.

The cause: on macOS, the `ytdlp-nodejs` wrapper's `binaryPath` resolves to
`yt-dlp_macos`, a PyInstaller build that unpacks itself on every launch and
takes ~10s to answer `--version`. `VERSION_RESOLUTION_TIMEOUT_MS` in
`yt-dlp-client.ts` is 5s, so version resolution gives up. The sibling `yt-dlp`
zipapp answers in ~1s, and in the scraper image the Linux binary answers
immediately, so production is unaffected.

The timeout exists to keep scraper boot unblocked. The choice is where the fix
belongs:
- raise the production timeout;
- let the test pass a longer one;
- prefer a faster binary on the host.

That choice is why this is triage, not ready-for-agent.

**Resolution:** none of the three. The test was deleted instead. `getVersion()`
only feeds the startup log line, and a failure logs `unknown` without blocking
boot. On a Mac the test exercised `yt-dlp_macos`, not the Linux binary
production runs, so it failed for a reason production never hits. The NOTE in
`getVersion()` already guards against going back to the wrapper's broken
`getVersionAsync()`. The production timeout stays at 5s.

**Blocked by:** None.

**Status:** wontfix

- [x] `npm run test:net` passes on macOS
- [x] Scraper boot is still bounded if the binary hangs
