---
name: ytdlp-audit
description: Check the yt-dlp responses prod fetched since the last audit for data the scraper wasn't built to handle.
disable-model-invocation: true
---

# yt-dlp audit

Prod keeps every yt-dlp response from the last 14 days. This skill hunts the ones fetched since the last audit for **surprises**: data that breaks something `YoutubeApiGetVideo.getVideo` assumes.

[`audit.ts`](audit.ts) does the reading. It pulls new records over SSH using only `docker inspect`, `ls` and `cat` from the prod skill's allowlist. It replays each record through the real `getVideo` with yt-dlp stubbed out, then runs `CHECKS` over the raw response. `EXPECTED`, at the top of the file, holds the values the flow was built against.

## 1. Run the audit

```bash
npx tsx .agents/skills/ytdlp-audit/audit.ts
```

Run it from the repo root and allow it up to 10 minutes: a backlog of several days takes a few. It starts from the cursor in `~/.ygl/ytdlp-audit-cursor` and leaves the cursor where it was.

**Done when:** the output ends with a `Through:` line, or says there are no new fetches.

## 2. Investigate every surprise

For each check under `Surprises`:

- Open an example with `--show <videoId>`, and one more when the examples' details differ. `--show <videoId> <field.path>` prints any part of the raw response.
- Follow the check's assumption into the code it names, and work out what the flow did with this response. The outcome line says what `getVideo` returned; the prod skill shows what was stored and how the job ended.
- Search `.scratch/parked/` and `docs/adr/` for it, and label it **known** (citing the file) or **new**.

**Done when:** every check under `Surprises` has a label and a sentence on what it cost the flow: a wrong row, a failed job, a skipped video, or nothing.

## 3. Report

Tell the user:

- the window: how many fetches, from when to when, and any retention gap the output reported;
- the outcome tally;
- the new surprises first, each with its check, an example video and what it cost; then the known ones, one line each with the file that covers them.

With no surprises, say so in one line after the window and the tally.

## 4. Advance the cursor

```bash
npx tsx .agents/skills/ytdlp-audit/audit.ts --advance <the Through value>
```

Then offer, for each new surprise, to park it with `/park`, or, when the user calls it normal and its check points at `EXPECTED`, to add its value there.

`--since <ISO>` audits from any point instead of the cursor, e.g. to recheck a window after changing `EXPECTED`.
