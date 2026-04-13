#!/usr/bin/env node
import { execSync } from "child_process";

const videoId = process.argv[2];
if (!videoId) {
  console.error("Usage: node scripts/check-captions.mjs <videoId>");
  process.exit(1);
}

const url = `https://youtube.com/watch?v=${videoId}`;
console.log(`Fetching: ${url}\n`);

let raw;
try {
  raw = execSync(
    `python _yt-dlp/yt_dlp/__main__.py --dump-json --no-download --skip-download --no-warnings "${url}"`,
    { encoding: "utf-8", timeout: 30000 }
  );
} catch (e) {
  console.error("yt-dlp failed:", e.message);
  process.exit(1);
}

const data = JSON.parse(raw.trim().split("\n")[0]);
const auto = data.automatic_captions || {};
const manual = data.subtitles || {};

console.log(`language: ${data.language ?? "(none)"}\n`);

console.log("=== AUTO CAPTIONS ===");
if (Object.keys(auto).length === 0) {
  console.log("(none)");
} else {
  for (const [lang, tracks] of Object.entries(auto)) {
    const fmts = tracks.map((t) => t.ext).join(", ");
    console.log(`  ${lang}: [${fmts}]`);
  }
}

console.log("\n=== MANUAL SUBTITLES ===");
if (Object.keys(manual).length === 0) {
  console.log("(none)");
} else {
  for (const [lang, tracks] of Object.entries(manual)) {
    const fmts = tracks.map((t) => t.ext).join(", ");
    console.log(`  ${lang}: [${fmts}]`);
  }
}
