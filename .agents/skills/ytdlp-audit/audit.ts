import "reflect-metadata";
import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as readline from "node:readline";
import { createGunzip } from "node:zlib";
import type { ZodError } from "zod";
import { Logger } from "../../../src/modules/_common/logger/logger.js";
import { YoutubeApiGetVideo } from "../../../src/modules/youtube-api/yt-api-get-video.js";
import { inputSchemas } from "../../../src/modules/youtube-api/yt-api-get-video.schemas.js";
import type { YtDlpClient } from "../../../src/modules/youtube-api/yt-dlp-client.js";
import { Failure } from "../../../src/types/index.js";

const HOST = "root@178.105.4.165";
const RAW_DIR_IN_CONTAINER = "/var/lib/ytdlp-raw";
const CURSOR_FILE = path.join(os.homedir(), ".ygl", "ytdlp-audit-cursor");
const CACHE_DIR = path.join(os.tmpdir(), "ytdlp-audit");
// Windows caps a command line at 32K characters.
const FILES_PER_SSH_CALL = 200;
const EXAMPLES_PER_CHECK = 10;

/**
 * What the flow was built against. A value outside these is a surprise; add it
 * here once the user accepts it as normal.
 */
const EXPECTED = {
  values: {
    _type: ["video"],
    live_status: ["not_live"],
    availability: ["public"],
    media_type: ["video"],
    age_limit: [0],
  } as Record<string, unknown[]>,
  audioLanguagePreference: [10, 5, -1, -10],
  mayBeMissing: [
    "track",
    "artist",
    "album",
    "creator",
    "abr",
    "audio_quality",
    "is_drc",
    "like_count",
    "comment_count",
  ],
};

const CHECKS = {
  "unclassified-error":
    "a failing fetch is an unprocessable video or the bot challenge (classifyUnprocessable, yt-dlp-client.ts); any other YT_DLP_ERROR fails the job",
  "validation-error":
    "the response matches inputSchemas.ytDlpJson (yt-api-get-video.schemas.ts)",
  "ambiguous-language":
    "the original mark or a single -orig track names one language (ADR-0009)",
  "entry-count": "yt-dlp prints one JSON object; getVideo takes value[0]",
  "id-mismatch":
    "yt-dlp returns the requested video; getVideo stores ytData.id",
  "unexpected-value": "the field takes one of EXPECTED.values (audit.ts)",
  "missing-field":
    "fields getVideo reads are present unless listed in EXPECTED.mayBeMissing (audit.ts)",
  "audio-preference":
    "audio formats carry language_preference 10 (original), 5 (default), -1, or -10 (descriptive)",
  "acodec-missing":
    "every format has acodec; getVideo counts a format as audio when acodec !== 'none'",
  "mark-without-language":
    "the audio marked original has a language; otherwise getVideo ignores the mark",
  "language-code-shape":
    "language codes start with a 2-3 letter base before the first '-' (baseCode, yt-api-get-video.ts)",
} as const;

type CheckId = keyof typeof CHECKS;
type Json = Record<string, any>;
type FetchRecord = {
  videoId: string;
  fetchedAt: string;
  result:
    | { ok: true; value: Json[] }
    | { ok: false; error: { type: string; message?: string } };
};
type Findings = Map<CheckId, Set<string>>;

const CAPTIONS_NOT_REPLAYED = "ytdlp-audit: captions are not downloaded on replay";

// getVideo logs every step, and the validator logs the whole response on a
// failure. Only the warnings matter: they name unsupported languages.
const warnings: string[] = [];
console.log = () => {};
console.error = () => {};
console.warn = (message: unknown) => {
  warnings.push(String(message));
};
const out = (line = "") => process.stdout.write(`${line}\n`);
const progress = (line: string) => process.stderr.write(`${line}\n`);

function ssh(command: string) {
  return spawn("ssh", ["-o", "BatchMode=yes", HOST, command]);
}

function exitOf(child: ReturnType<typeof ssh>, command: string) {
  let stderr = "";
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });
  return new Promise<void>((resolve, reject) => {
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`ssh '${command}' exited ${code}: ${stderr}`)),
    );
  });
}

async function sshText(command: string): Promise<string> {
  const child = ssh(command);
  let stdout = "";
  child.stdout.on("data", (chunk) => {
    stdout += chunk;
  });
  await exitOf(child, command);
  return stdout;
}

/** Resolves false when the stream ended inside a file still being written. */
async function streamRecords(
  command: string,
  onRecord: (record: FetchRecord) => Promise<void>,
): Promise<boolean> {
  const child = ssh(command);
  const exited = exitOf(child, command);
  const lines = readline.createInterface({
    input: child.stdout.pipe(createGunzip()),
    crlfDelay: Infinity,
  });

  try {
    for await (const line of lines) {
      // Records written before the trailing newline was added share one line.
      for (const json of line.split(/(?<=\})(?=\{"videoId":)/)) {
        if (json.trim()) await onRecord(JSON.parse(json));
      }
    }
  } catch (error) {
    if ((error as { code?: string }).code !== "Z_BUF_ERROR") throw error;
    // A failed cat also ends gzip early; drain so cat can exit and report it.
    child.stdout.unpipe();
    child.stdout.resume();
    await exited;
    return false;
  }
  await exited;
  return true;
}

async function replay(
  record: FetchRecord,
): Promise<{ outcome: string; findings: Findings }> {
  const findings: Findings = new Map();
  const flag = (check: CheckId, detail: string) => {
    const details = findings.get(check) ?? new Set<string>();
    details.add(detail);
    findings.set(check, details);
  };

  warnings.length = 0;
  const client = {
    execJson: async () => record.result,
    exec: async () =>
      Failure({ type: "YT_DLP_ERROR", message: CAPTIONS_NOT_REPLAYED }),
  };
  const result = await new YoutubeApiGetVideo(
    new Logger({ context: "ytdlp-audit" }),
    client as unknown as YtDlpClient,
  ).getVideo(record.videoId);
  const unsupported = warnings
    .map((w) => w.match(/unsupported language code "([^"]+)"/)?.[1])
    .find(Boolean);

  let outcome: string;
  if (result.ok) {
    const v = result.value;
    outcome = `${v.languageCode ?? "no language"} · auto ${v.autoCaptions.state} · manual ${v.manualCaptions.state}`;
    if (unsupported) outcome += ` · unsupported "${unsupported}"`;
  } else {
    const error = result.error;
    switch (error.type) {
      case "YT_DLP_ERROR":
        if (error.message === CAPTIONS_NOT_REPLAYED) {
          outcome = "en · both caption tracks downloaded";
        } else if (error.message.startsWith("YouTube bot challenge")) {
          outcome = "YT_DLP_ERROR · bot challenge";
        } else if (error.message === "yt-dlp returned no output") {
          outcome = "YT_DLP_ERROR · no output";
        } else {
          outcome = "YT_DLP_ERROR · unclassified";
          flag(
            "unclassified-error",
            (error.message.split("\n")[0] ?? "").slice(0, 200),
          );
        }
        break;
      case "VALIDATION_ERROR":
        outcome = "VALIDATION_ERROR";
        for (const issue of (error.cause as ZodError | undefined)?.issues ??
          []) {
          flag("validation-error", `${issue.path.join(".")}: ${issue.message}`);
        }
        break;
      case "AMBIGUOUS_VIDEO_LANGUAGE":
        outcome = "AMBIGUOUS_VIDEO_LANGUAGE";
        flag(
          "ambiguous-language",
          `marks [${error.markLanguages}] · audio [${error.audioLanguages}] · -orig [${error.origKeys}]`,
        );
        break;
      default:
        outcome = error.type;
    }
  }

  if (record.result.ok) inspectResponse(record, record.result.value, flag);
  return { outcome, findings };
}

const isLanguageShaped = (code: string) =>
  /^[a-z]{2,3}$/i.test(code.split("-")[0] ?? "");

function inspectResponse(
  record: FetchRecord,
  entries: Json[],
  flag: (check: CheckId, detail: string) => void,
) {
  if (entries.length !== 1) flag("entry-count", `${entries.length} entries`);
  const v = entries[0];
  if (!v) return;

  if (v.id !== record.videoId) {
    flag("id-mismatch", `returned ${v.id} ${JSON.stringify(v.title)}`);
  }

  for (const [field, allowed] of Object.entries(EXPECTED.values)) {
    if (v[field] != null && !allowed.includes(v[field])) {
      flag("unexpected-value", `${field}=${JSON.stringify(v[field])}`);
    }
  }

  const readFields = [
    ...Object.keys(inputSchemas.ytDlpJson.shape),
    ...Object.keys(EXPECTED.values),
  ];
  for (const field of readFields) {
    if (v[field] == null && !EXPECTED.mayBeMissing.includes(field)) {
      flag("missing-field", field);
    }
  }

  for (const f of (v.formats ?? []) as Json[]) {
    if (f.acodec == null) {
      flag("acodec-missing", `format ${f.format_id} (${f.format_note})`);
    }
    if (f.acodec === "none") continue;
    if (!EXPECTED.audioLanguagePreference.includes(f.language_preference)) {
      flag(
        "audio-preference",
        `format ${f.format_id} language_preference=${f.language_preference}`,
      );
    }
    if (f.language_preference === 10 && !f.language) {
      flag("mark-without-language", `format ${f.format_id}`);
    }
    if (f.language && !isLanguageShaped(f.language)) {
      flag("language-code-shape", `audio ${f.language}`);
    }
  }

  for (const key of Object.keys(v.automatic_captions ?? {})) {
    if (key.endsWith("-orig") && !isLanguageShaped(key)) {
      flag("language-code-shape", `auto ${key}`);
    }
  }
  for (const key of Object.keys(v.subtitles ?? {})) {
    if (!isLanguageShaped(key)) flag("language-code-shape", `manual ${key}`);
  }
  if (v.language && !isLanguageShaped(v.language)) {
    flag("language-code-shape", `language ${v.language}`);
  }
}

class Tally {
  total = 0;
  first: string | undefined;
  last: string | undefined;
  readonly outcomes = new Map<string, number>();
  readonly byCheck = new Map<
    CheckId,
    { count: number; examples: { record: FetchRecord; details: string }[] }
  >();

  add(record: FetchRecord, outcome: string, findings: Findings) {
    this.total++;
    if (!this.first || record.fetchedAt < this.first) {
      this.first = record.fetchedAt;
    }
    if (!this.last || record.fetchedAt > this.last) {
      this.last = record.fetchedAt;
    }
    this.outcomes.set(outcome, (this.outcomes.get(outcome) ?? 0) + 1);

    for (const [check, details] of findings) {
      const entry = this.byCheck.get(check) ?? { count: 0, examples: [] };
      entry.count++;
      if (entry.examples.length < EXAMPLES_PER_CHECK) {
        entry.examples.push({ record, details: [...details].join("; ") });
      }
      this.byCheck.set(check, entry);
    }
  }
}

async function audit(since: string | undefined) {
  const dir = (
    await sshText(
      `docker inspect --format '{{range .Mounts}}{{if eq .Destination "${RAW_DIR_IN_CONTAINER}"}}{{.Source}}{{end}}{{end}}' scraper`,
    )
  ).trim();
  if (!dir) throw new Error(`scraper has no mount at ${RAW_DIR_IN_CONTAINER}`);

  const days = (await sshText(`ls ${dir}`))
    .split("\n")
    .filter((name) => /^\d{4}-\d{2}-\d{2}$/.test(name))
    .sort();
  const sinceDay = since?.slice(0, 10);
  const sinceName = since?.slice(11, 19).replaceAll(":", "");

  const tally = new Tally();
  const onRecord = async (record: FetchRecord) => {
    if (since && record.fetchedAt <= since) return;
    const { outcome, findings } = await replay(record);
    tally.add(record, outcome, findings);
  };

  let partial = false;
  for (const day of days.filter((d) => !sinceDay || d >= sinceDay)) {
    const names = (await sshText(`ls ${dir}/${day}`))
      .split("\n")
      .filter((name) => name.endsWith(".json.gz"));
    const wanted =
      day === sinceDay && sinceName
        ? names.filter((name) => name.slice(0, 6) >= sinceName)
        : names;
    progress(`${day}: ${wanted.length} files`);
    if (wanted.length === 0) continue;

    const commands =
      wanted.length === names.length
        ? [`cat ${dir}/${day}/*.json.gz`]
        : chunk(wanted, FILES_PER_SSH_CALL).map(
            (batch) => `cat ${batch.map((n) => `${dir}/${day}/${n}`).join(" ")}`,
          );
    for (const command of commands) {
      if (!(await streamRecords(command, onRecord))) partial = true;
    }
  }

  report(tally, { since, oldestDay: days[0], partial });
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

function report(
  tally: Tally,
  {
    since,
    oldestDay,
    partial,
  }: { since?: string; oldestDay?: string; partial: boolean },
) {
  if (since && oldestDay && since.slice(0, 10) < oldestDay) {
    out(
      `Gap: the oldest day on prod is ${oldestDay}; fetches after ${since} and before it are past retention and were never checked.`,
    );
  }
  if (partial) {
    out("A file was still being written; it will be checked on the next run.");
  }
  if (tally.total === 0) {
    out(`No new fetches${since ? ` since ${since}` : ""}.`);
    return;
  }

  out(`${tally.total} new fetches · ${tally.first} → ${tally.last}`);
  out(`Previous cursor: ${since ?? "none"}`);
  out();

  out("Outcomes (replayed through YoutubeApiGetVideo.getVideo)");
  for (const [outcome, count] of [...tally.outcomes].sort(
    (a, b) => b[1] - a[1],
  )) {
    out(`  ${String(count).padStart(6)}  ${outcome}`);
  }
  out();

  if (tally.byCheck.size === 0) {
    out("Surprises: none");
  } else {
    out(`Surprises: ${tally.byCheck.size} checks`);
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    for (const [check, { count, examples }] of tally.byCheck) {
      out(`  ${check} (${count}) — ${CHECKS[check]}`);
      for (const { record, details } of examples) {
        out(`    ${record.videoId}  ${record.fetchedAt}  ${details}`);
        fs.writeFileSync(
          path.join(CACHE_DIR, `${record.videoId}.json`),
          JSON.stringify(record),
        );
      }
      if (count > examples.length) out(`    +${count - examples.length} more`);
    }
  }
  out();
  out(`Through: ${tally.last}`);
}

async function show(videoId: string, field: string | undefined) {
  const file = path.join(CACHE_DIR, `${videoId}.json`);
  if (!fs.existsSync(file)) {
    throw new Error(`${videoId} is not one of the cached surprise examples`);
  }
  const record: FetchRecord = JSON.parse(fs.readFileSync(file, "utf8"));
  const { outcome, findings } = await replay(record);

  out(`requested ${record.videoId} · fetched ${record.fetchedAt}`);
  out(`outcome: ${outcome}`);
  for (const [check, details] of findings) {
    out(`${check}: ${[...details].join("; ")}`);
  }
  if (!record.result.ok) {
    out(`error ${record.result.error.type}: ${record.result.error.message}`);
    return;
  }

  const v = record.result.value[0] ?? {};
  if (field) {
    const value = field
      .split(".")
      .reduce<unknown>((node, key) => (node as Json | undefined)?.[key], v);
    out(JSON.stringify(value, null, 2)?.slice(0, 20_000));
    return;
  }

  out(
    `${record.result.value.length} entries · id ${v.id} · ${JSON.stringify(v.title)}`,
  );
  out(
    `channel ${v.channel_id} · ${v.duration}s · language ${v.language} · ${Object.keys(
      EXPECTED.values,
    )
      .map((f) => `${f} ${JSON.stringify(v[f])}`)
      .join(" · ")}`,
  );
  out("audio formats (format_id, acodec, language, language_preference, note):");
  for (const f of (v.formats ?? []) as Json[]) {
    if (f.acodec !== "none") {
      out(
        `  ${f.format_id}  ${f.acodec}  ${f.language}  ${f.language_preference}  ${f.format_note}`,
      );
    }
  }
  const autoKeys = Object.keys(v.automatic_captions ?? {});
  out(
    `-orig keys: ${autoKeys.filter((k) => k.endsWith("-orig")).join(", ") || "none"}`,
  );
  out(`automatic_captions keys: ${autoKeys.length}`);
  out(`subtitles keys: ${Object.keys(v.subtitles ?? {}).join(", ") || "none"}`);
}

function advance(cursor: string) {
  if (Number.isNaN(Date.parse(cursor))) throw new Error(`not a date: ${cursor}`);
  fs.mkdirSync(path.dirname(CURSOR_FILE), { recursive: true });
  fs.writeFileSync(CURSOR_FILE, cursor);
  out(`Cursor at ${cursor}`);
}

function readCursor(): string | undefined {
  return fs.existsSync(CURSOR_FILE)
    ? fs.readFileSync(CURSOR_FILE, "utf8").trim() || undefined
    : undefined;
}

async function main() {
  const [mode, arg, extra] = process.argv.slice(2);
  if (mode === "--show" && arg) return show(arg, extra);
  if (mode === "--advance" && arg) return advance(arg);
  if (mode === "--since" && arg) return audit(arg);
  if (mode === undefined) return audit(readCursor());
  throw new Error(
    "usage: audit.ts [--since <ISO>] | --show <videoId> [field.path] | --advance <ISO>",
  );
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : error}\n`);
  process.exit(1);
});
