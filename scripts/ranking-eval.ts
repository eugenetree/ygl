#!/usr/bin/env npx tsx
// Measures page 1 of a fixed set of searches on the live site, as a Markdown
// table plus the top captions of a few searches. Read-only: GET requests only.
//
// Usage:
// npx tsx scripts/ranking-eval.ts
// npx tsx scripts/ranking-eval.ts http://localhost:3001

import {
  type Clip,
  searchResponseSchema,
} from "../src/modules/api/contract/search.js";
import {
  countWords,
  endsSentence,
  startsSentence,
} from "../src/modules/captions-search/caption-features.js";

const SEARCHES = [
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

const SHOWCASE_SEARCHES = ["strange", "you know", "the", "apple", "get rid of"];
const SHOWCASE_SIZE = 5;
const PAGE_SIZE = 20;

type SearchOutcome =
  { search: string; clips: Clip[] } | { search: string; failure: string };

async function search(baseUrl: string, query: string): Promise<SearchOutcome> {
  const url = new URL("/api/search", baseUrl);
  url.searchParams.set("q", query);
  url.searchParams.set("limit", String(PAGE_SIZE));
  try {
    const response = await fetch(url, { method: "GET" });
    if (!response.ok) {
      return { search: query, failure: `HTTP ${response.status}` };
    }
    const body = searchResponseSchema.safeParse(await response.json());
    if (!body.success) {
      return { search: query, failure: "unexpected response" };
    }
    return { search: query, clips: body.data.clips };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { search: query, failure: message };
  }
}

function metricsRow(outcome: SearchOutcome): string[] {
  if ("failure" in outcome) {
    return [outcome.search, `failed: ${outcome.failure}`, "", "", "", "", ""];
  }
  const { clips } = outcome;
  if (clips.length === 0) {
    return [outcome.search, "no results", "", "", "", "", ""];
  }
  const wordCounts = clips.map((clip) => countWords(clip.text));
  const short = wordCounts.filter((count) => count >= 1 && count <= 2).length;
  const wholeSentences = clips.filter(
    (clip) => startsSentence(clip.text) && endsSentence(clip.text),
  ).length;
  return [
    outcome.search,
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
  const baseUrl = process.argv[2] ?? "https://saythis.co";

  const outcomes: SearchOutcome[] = [];
  for (const query of SEARCHES) {
    outcomes.push(await search(baseUrl, query));
  }

  const lines = [
    `## ${new Date().toLocaleDateString("sv-SE")} — ${baseUrl}`,
    "",
    tableRow([
      "Search",
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
    if (!SHOWCASE_SEARCHES.includes(outcome.search) || !("clips" in outcome)) {
      continue;
    }
    lines.push("", `### Top captions: \`${outcome.search}\``, "");
    for (const [index, clip] of outcome.clips
      .slice(0, SHOWCASE_SIZE)
      .entries()) {
      lines.push(
        `${index + 1}. ${cell(clip.text)} — _${cell(clip.video.channel.name)}_`,
      );
    }
  }

  console.log(lines.join("\n"));
}

void main();
