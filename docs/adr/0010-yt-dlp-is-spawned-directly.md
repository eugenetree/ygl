# yt-dlp is spawned directly, not through a Node wrapper

`YtDlpClient` runs the `yt-dlp` on PATH as a child process. Until 2026-10 it
went through the `ytdlp-nodejs` wrapper, but we already passed raw arguments and
read raw output, so the wrapper added little. Meanwhile it cut stderr down to
its first `ERROR:` line, had a `--version` call that never succeeded, resolved
its own binary in ways that broke on macOS and needed a symlink in the scraper
image, added flags of its own to every run, and gave us no handle on the process
to kill a stream nobody reads any more.

## Consequences

- The wrapper's flags that shaped yt-dlp's output are now passed explicitly:
  `--js-runtime node` (ADR-0004), and `--quiet --progress --newline` in place of
  its `--print after_move:…`, which made yt-dlp quiet. A run that logs an
  `ERROR:` line is still a failure even when yt-dlp exits 0, as it was under the
  wrapper.
- Nothing downloads yt-dlp for you. The scraper image installs it; a developer
  running the scraper or `npm run test:net` installs it themselves
  (`pip install yt-dlp`, which also lets it load the bgutil plugin).
