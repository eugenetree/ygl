#!/usr/bin/env node
// Converts a .ovpn file to base64 and prints the VPN_CONFIG_B64 .env line.
//
// Usage: node scripts/vpn-config-to-b64.js [config.ovpn]
// Default input: config.ovpn in the project root

import { readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const filePath = resolve(process.argv[2] ?? "config.ovpn");

let content;
try {
  content = readFileSync(filePath);
} catch {
  console.error(`Error: file not found: ${filePath}`);
  process.exit(1);
}

const b64 = content.toString("base64");
const outPath = join(tmpdir(), "vpn-config-b64.txt");
writeFileSync(outPath, `VPN_CONFIG_B64=${b64}`);
console.log(`Saved to: ${outPath}`);
