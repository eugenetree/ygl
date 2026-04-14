#!/usr/bin/env node
// Converts a cookies.txt file to base64 and prints the YTDLP_COOKIES_B64 .env line.
//
// Usage: node scripts/cookies-to-b64.js [cookies.txt]
// Default input: cookies.txt in the project root

import { readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const filePath = resolve(process.argv[2] ?? "cookies.txt");

let content;
try {
  content = readFileSync(filePath);
} catch {
  console.error(`Error: file not found: ${filePath}`);
  process.exit(1);
}

const b64 = content.toString("base64");
const outPath = join(tmpdir(), "ytdlp-cookies-b64.txt");
writeFileSync(outPath, `YTDLP_COOKIES_B64=${b64}`);
console.log(`Saved to: ${outPath}`);
