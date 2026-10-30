#!/usr/bin/env npx tsx
// Measures page 1 of a fixed set of searches on the live site, as a Markdown
// table plus the top captions of a few searches. Read-only: GET requests only.
// Each run is printed and also saved to ranking-eval-runs/ (gitignored): the
// report as .md and every raw API response beside it as .json.
//
// Usage:
// npx tsx scripts/ranking-eval.ts
// npx tsx scripts/ranking-eval.ts http://localhost:3001
// npx tsx scripts/ranking-eval.ts --phase "before phase 1"

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import {
  type Clip,
  searchResponseSchema,
} from "../src/modules/api/contract/search.js";
import {
  countWords,
  endsSentence,
  startsSentence,
} from "../src/modules/captions-search/caption-features.js";

const QUERIES = [
  "strange",
  "serendipity",
  "worcestershire",
  "once in a while",
  "you know",
  "make sense",
  "give up",
  "by the way",
  "the",
  "really",
  "actually",
  "people",
  "beautiful",
  "decision",
  "although",
  "whatever",
  "ubiquitous",
  "meticulous",
  "figure out",
  "look forward to",
  "come up with",
  "get rid of",
  "piece of cake",
  "at the end of the day",
  "no way",
  "as a matter of fact",
  "I don't know what",
  "wonder",
  "apple",
  "don't",
  "well-known",
];

const SHOWCASE_QUERIES = ["strange", "you know", "the", "apple", "get rid of"];
const SHOWCASE_SIZE = 5;
const PAGE_SIZE = 20;
const RUNS_DIR = path.join(__dirname, "..", "ranking-eval-runs");

// `response` is the body as the API sent it, kept for the run's .json file.
type SearchOutcome = { query: string; url: string; response?: unknown } & (
  | { clips: Clip[] }
  | { failure: string }
);

async function search(baseUrl: string, query: string): Promise<SearchOutcome> {
  const url = new URL("/api/search", baseUrl);
  url.searchParams.set("q", query);
  url.searchParams.set("limit", String(PAGE_SIZE));
  const request = { query, url: url.toString() };
  try {
    const response = await fetch(url, { method: "GET" });
    const text = await response.text();
    const raw = parseJson(text);
    if (!response.ok) {
      return { ...request, response: raw, failure: `HTTP ${response.status}` };
    }
    const body = searchResponseSchema.safeParse(raw);
    if (!body.success) {
      return { ...request, response: raw, failure: "unexpected response" };
    }
    return { ...request, response: raw, clips: body.data.clips };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ...request, failure: message };
  }
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function metricsRow(outcome: SearchOutcome): string[] {
  if ("failure" in outcome) {
    return [outcome.query, `failed: ${outcome.failure}`, "", "", "", "", ""];
  }
  const { clips } = outcome;
  if (clips.length === 0) {
    return [outcome.query, "no results", "", "", "", "", ""];
  }
  const wordCounts = clips.map((clip) => countWords(clip.text));
  const short = wordCounts.filter((count) => count >= 1 && count <= 2).length;
  const wholeSentences = clips.filter(
    (clip) => startsSentence(clip.text) && endsSentence(clip.text),
  ).length;
  return [
    outcome.query,
    String(clips.length),
    percent(short, clips.length),
    percent(wholeSentences, clips.length),
    String(median(wordCounts)),
    String(new Set(clips.map((clip) => clip.video.id)).size),
    String(new Set(clips.map((clip) => clip.video.channel.name)).size),
  ];
}

function percent(part: number, whole: number): string {
  return `${Math.round((part / whole) * 100)}%`;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

function tableRow(cells: string[]): string {
  return `| ${cells.map(cell).join(" | ")} |`;
}

function cell(text: string): string {
  return text.replace(/\s+/g, " ").trim().replaceAll("|", "\\|");
}

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: { phase: { type: "string" } },
  });
  const baseUrl = positionals[0] ?? "https://saythis.co";
  const startedAt = new Date();
  const heading = [
    startedAt.toLocaleDateString("sv-SE"),
    ...(values.phase ? [values.phase] : []),
    baseUrl,
  ].join(" — ");

  const outcomes: SearchOutcome[] = [];
  for (const query of QUERIES) {
    outcomes.push(await search(baseUrl, query));
  }

  const lines = [
    `## ${heading}`,
    "",
    tableRow([
      "Query",
      "Clips",
      "1–2 words",
      "Whole sentences",
      "Median words",
      "Videos",
      "Channels",
    ]),
    tableRow(["---", "--:", "--:", "--:", "--:", "--:", "--:"]),
    ...outcomes.map((outcome) => tableRow(metricsRow(outcome))),
  ];

  for (const outcome of outcomes) {
    if (!SHOWCASE_QUERIES.includes(outcome.query) || !("clips" in outcome)) {
      continue;
    }
    lines.push("", `### Top captions: \`${outcome.query}\``, "");
    for (const [index, clip] of outcome.clips
      .slice(0, SHOWCASE_SIZE)
      .entries()) {
      lines.push(
        `${index + 1}. ${cell(clip.text)} — _${cell(clip.video.channel.name)}_`,
      );
    }
  }

  const report = lines.join("\n");
  console.log(report);

  const runFile = path.join(RUNS_DIR, runFileName(startedAt, values.phase));
  const responses = {
    startedAt: startedAt.toISOString(),
    phase: values.phase ?? null,
    baseUrl,
    searches: outcomes.map(({ query, url, response, ...result }) => ({
      query,
      url,
      failure: "failure" in result ? result.failure : null,
      response: response ?? null,
    })),
  };
  await mkdir(RUNS_DIR, { recursive: true });
  await writeFile(`${runFile}.md`, `${report}\n`);
  await writeFile(`${runFile}.json`, `${JSON.stringify(responses, null, 2)}\n`);
  console.error(`\nSaved to ${runFile}.md and .json`);
}

// e.g. 2026-10-30_14-05-12_before-phase-1: sorts by time, never overwrites an
// earlier run.
function runFileName(startedAt: Date, phase: string | undefined): string {
  const time = startedAt
    .toLocaleString("sv-SE")
    .replace(" ", "_")
    .replaceAll(":", "-");
  const slug = phase
    ?.toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return slug ? `${time}_${slug}` : time;
}

void main();
