import { readFileSync } from "fs";
import path from "path";
import type { Kysely } from "kysely";
import type { Database } from "../types.js";
import { dbClient } from "../client.js";

const FIXTURES_DIR = path.join(__dirname, "../fixtures");

function load<T>(name: string): T[] {
  return JSON.parse(
    readFileSync(path.join(FIXTURES_DIR, `${name}.json`), "utf-8"),
  ) as T[];
}

function strip<T extends { createdAt?: unknown; updatedAt?: unknown }>(
  rows: T[],
): Omit<T, "createdAt" | "updatedAt">[] {
  return rows.map(({ createdAt: _ca, updatedAt: _ua, ...rest }) => rest);
}

export async function seedDevFixtures(db: Kysely<Database>) {
  // Insert in FK-safe order. ON CONFLICT DO NOTHING makes re-runs safe.

  await db
    .insertInto("searchChannelQueries")
    .values(strip(load("search_channel_queries")))
    .onConflict((oc) => oc.doNothing())
    .execute();

  await db
    .insertInto("channels")
    .values(strip(load("channels")))
    .onConflict((oc) => oc.doNothing())
    .execute();

  await db
    .insertInto("channelDiscoveryJobs")
    .values(strip(load("channel_discovery_jobs")))
    .onConflict((oc) => oc.doNothing())
    .execute();

  // channelEntries.id = channel ID; channelJobs.channelId references channelEntries.id
  await db
    .insertInto("channelEntries")
    .values(strip(load("channel_entries")))
    .onConflict((oc) => oc.doNothing())
    .execute();

  await db
    .insertInto("channelJobs")
    .values(strip(load("channel_jobs")))
    .onConflict((oc) => oc.doNothing())
    .execute();

  await db
    .insertInto("videoDiscoveryJobs")
    .values(strip(load("video_discovery_jobs")))
    .onConflict((oc) => oc.doNothing())
    .execute();

  // channelPriorityScores has no FK constraint to channels
  await db
    .insertInto("channelPriorityScores")
    .values(load("channel_priority_scores"))
    .onConflict((oc) => oc.doNothing())
    .execute();

  await db
    .insertInto("videos")
    .values(strip(load("videos")))
    .onConflict((oc) => oc.doNothing())
    .execute();

  // videoEntries.id = video ID; videoJobs.videoId references videoEntries.id
  await db
    .insertInto("videoEntries")
    .values(strip(load("video_entries")))
    .onConflict((oc) => oc.doNothing())
    .execute();

  await db
    .insertInto("videoJobs")
    .values(strip(load("video_jobs")))
    .onConflict((oc) => oc.doNothing())
    .execute();

  await db
    .insertInto("captions")
    .values(strip(load("captions")))
    .onConflict((oc) => oc.doNothing())
    .execute();
}

if (require.main === module) {
  seedDevFixtures(dbClient)
    .then(() => console.log("Dev fixtures seeded successfully."))
    .catch((err) => {
      console.error("Dev seed failed:", err);
      process.exit(1);
    })
    .finally(() => dbClient.destroy());
}
