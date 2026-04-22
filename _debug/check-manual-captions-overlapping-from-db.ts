import { readFileSync } from "node:fs";
import * as path from "node:path";

type DbCaptionRow = {
  id: string;
  start_time: number;
  end_time: number;
  duration: number;
  text: string;
  type: "manual" | "auto";
  video_id: string;
};

const filePath = process.argv[2] ?? path.resolve("captions.json");

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

function main() {
  console.log(`\nLoading captions from: ${filePath}\n`);

  const raw = JSON.parse(readFileSync(filePath, "utf-8")) as { captions: DbCaptionRow[] };

  const manual = raw.captions
    .filter((c) => c.type === "manual")
    .sort((a, b) => a.start_time - b.start_time);

  if (manual.length === 0) {
    console.error("No manual captions found in file.");
    process.exit(1);
  }

  const videoIds = new Set(manual.map((c) => c.video_id));
  console.log(`Video(s): ${[...videoIds].join(", ")}`);
  console.log(`Manual caption segments: ${manual.length}\n`);

  // Replicates ManualCaptionsValidator.hasOverlappingTimestamps.
  // NOTE: that check uses array order (i, i+1), not sorted order. Here we
  // preserve whatever order the DB returned — which by default is insertion
  // order. We additionally run a sorted pass for comparison.

  const runCheck = (caps: DbCaptionRow[], label: string) => {
    const overlaps: Array<{ index: number; current: DbCaptionRow; next: DbCaptionRow }> = [];
    for (let i = 0; i < caps.length; i++) {
      const current = caps[i];
      const next = caps[i + 1];
      if (next && current.end_time > next.start_time) {
        overlaps.push({ index: i, current, next });
      }
    }

    console.log(`--- ${label} --- ${overlaps.length} overlapping pair(s)`);
    for (const { index, current, next } of overlaps) {
      const overlapMs = current.end_time - next.start_time;
      console.log(`#${index} overlap by ${overlapMs}ms`);
      console.log(
        `  current[${index}]  ${formatTime(current.start_time)} -> ${formatTime(current.end_time)}  | ${JSON.stringify(current.text)}`,
      );
      console.log(
        `  next   [${index + 1}] ${formatTime(next.start_time)} -> ${formatTime(next.end_time)}  | ${JSON.stringify(next.text)}`,
      );
      console.log();
    }
  };

  runCheck(raw.captions.filter((c) => c.type === "manual"), "export order");
  runCheck(manual, "sorted by start_time");

  // Reprocessing queries `captions` without ORDER BY, so Postgres may return
  // rows in any order. Simulate what happens then.
  const shuffled = [...manual];
  // Deterministic shuffle for reproducibility.
  let seed = 42;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) % 2 ** 32;
    return seed / 2 ** 32;
  };
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  runCheck(shuffled, "shuffled (simulates unordered SELECT)");
}

main();
