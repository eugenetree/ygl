import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";

import { Logger } from "../src/modules/_common/logger/logger.js";
import { YtDlpClient } from "../src/modules/youtube-api/yt-dlp-client.js";
import { captionsExtractor } from "../src/modules/youtube-api/extractors/captions.extractor.js";
import { Caption } from "../src/modules/youtube-api/youtube-api.types.js";

const VIDEO_ID = process.argv[2] ?? "v293iGJ2PVY";

const logger = new Logger({ context: "debug:overlap", category: "debug" });
const ytDlpClient = new YtDlpClient(logger);

function findEnglishManualKey(subtitles: Record<string, unknown[]>): string | null {
  const nonEmpty = Object.entries(subtitles).filter(([, formats]) => Boolean(formats?.length));

  const exactEn = nonEmpty.find(([key]) => key.toLowerCase() === "en");
  if (exactEn) return exactEn[0];

  const enPrefix = nonEmpty.find(([key]) => key.toLowerCase().startsWith("en-"));
  if (enPrefix) return enPrefix[0];

  return null;
}

function formatTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const remainingMs = ms % 1000;
  const hh = hours.toString().padStart(2, "0");
  const mm = minutes.toString().padStart(2, "0");
  const ss = seconds.toString().padStart(2, "0");
  const mmm = remainingMs.toString().padStart(3, "0");
  return `${hh}:${mm}:${ss}.${mmm}`;
}

async function downloadManualCaptions(videoId: string, langKey: string): Promise<Caption[]> {
  const tmp = await mkdtemp(path.join(tmpdir(), "ygl-overlap-"));
  try {
    const url = encodeURI(`https://youtube.com/watch?v=${videoId}`);
    const outDir = path.join(tmp, "manual");

    const result = await ytDlpClient.exec([
      url,
      "--write-subs",
      "--sub-format",
      "json3",
      "--sub-langs",
      langKey,
      "--skip-download",
      "--no-warnings",
      "-o",
      path.join(outDir, "%(id)s"),
    ]);
    if (!result.ok) {
      throw new Error(`yt-dlp failed to download manual captions: ${JSON.stringify(result.error)}`);
    }

    const files = await readdir(outDir);
    const jsonFile = files.find((f) => f.endsWith(".json3"));
    if (!jsonFile) throw new Error("No .json3 file produced by yt-dlp");

    const content = await readFile(path.join(outDir, jsonFile), "utf-8");
    const json = JSON.parse(content);
    const extracted = captionsExtractor.extractFromJson({ jsonResponse: json, type: "manual" });
    if (!extracted.ok) {
      throw new Error(`Failed to parse captions: ${JSON.stringify(extracted.error)}`);
    }

    return extracted.value.map((c) => {
      const { textSegments, ...rest } = c;
      return { ...rest, text: textSegments.map((s) => s.utf8).join("") };
    });
  } finally {
    await rm(tmp, { recursive: true, force: true }).catch(() => { });
  }
}

async function main() {
  console.log(`\nChecking video: ${VIDEO_ID}\n`);

  const dump = await ytDlpClient.execJson<{
    id: string;
    title: string;
    subtitles?: Record<string, unknown[]>;
  }>([
    encodeURI(`https://youtube.com/watch?v=${VIDEO_ID}`),
    "--dump-json",
    "--no-download",
    "--skip-download",
    "--no-warnings",
  ]);

  if (!dump.ok) {
    console.error("yt-dlp --dump-json failed:", dump.error);
    process.exit(1);
  }
  if (!dump.value.length) {
    console.error("yt-dlp returned no output");
    process.exit(1);
  }

  const data = dump.value[0];
  console.log(`Title: ${data.title}`);

  const subtitles = data.subtitles ?? {};
  const availableManual = Object.entries(subtitles)
    .filter(([, formats]) => Boolean(formats?.length))
    .map(([k]) => k);
  console.log(`Available manual caption tracks: ${availableManual.join(", ") || "<none>"}`);

  const key = findEnglishManualKey(subtitles);
  if (!key) {
    console.error("No en or en-* manual caption track found. Aborting.");
    process.exit(1);
  }
  console.log(`Using manual caption track: ${key}\n`);

  const captions = await downloadManualCaptions(VIDEO_ID, key);
  console.log(`Fetched ${captions.length} manual caption segments\n`);

  // Replicates ManualCaptionsValidator.hasOverlappingTimestamps
  const overlaps: Array<{ index: number; current: Caption; next: Caption }> = [];
  for (let i = 0; i < captions.length; i++) {
    const current = captions[i];
    const next = captions[i + 1];
    if (next && current.endTime > next.startTime) {
      overlaps.push({ index: i, current, next });
    }
  }

  if (overlaps.length === 0) {
    console.log("No overlapping timestamps detected.");
    return;
  }

  console.log(`Found ${overlaps.length} overlapping pair(s):\n`);
  for (const { index, current, next } of overlaps) {
    const overlapMs = current.endTime - next.startTime;
    console.log(`#${index} overlap by ${overlapMs}ms`);
    console.log(
      `  current[${index}]  ${formatTime(current.startTime)} -> ${formatTime(current.endTime)}  | ${JSON.stringify(current.text)}`,
    );
    console.log(
      `  next   [${index + 1}] ${formatTime(next.startTime)} -> ${formatTime(next.endTime)}  | ${JSON.stringify(next.text)}`,
    );
    console.log();
  }
}

main().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});
