import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Kysely } from "kysely";
import { useTestDatabase } from "../../db/testing/test-database.js";
import type { Database } from "../../db/types.js";
import { ClipVideoRepository } from "./clip-video.repository.js";

// ---- Fixtures ---------------------------------------------------------------

async function seedChannel(
  db: Kysely<Database>,
  channel: { id: string; name: string },
) {
  await db
    .insertInto("channels")
    .values({
      ...channel,
      viewCount: 0,
      videoCount: 0,
      isFamilySafe: true,
      channelCreatedAt: new Date(),
      username: channel.id.toLowerCase(),
      isArtist: false,
      keywords: [],
    })
    .execute();
}

async function seedVideo(
  db: Kysely<Database>,
  video: { id: string; title: string; channelId: string },
) {
  await db
    .insertInto("videos")
    .values({
      ...video,
      duration: 213,
      keywords: [],
      viewCount: 0,
      thumbnail: `https://i.ytimg.com/vi/${video.id}/hqdefault.jpg`,
      autoCaptionsStatus: "CAPTIONS_VALID",
      manualCaptionsStatus: "CAPTIONS_VALID",
      categories: [],
    })
    .execute();
}

// ---- Tests ------------------------------------------------------------------

describe("ClipVideoRepository.findByIds", () => {
  const db = useTestDatabase();
  const sut = new ClipVideoRepository(db);

  it("returns each video's title and its channel's name, keyed by video id", async () => {
    await seedChannel(db, { id: "UC-rick", name: "Rick Astley" });
    await seedChannel(db, { id: "UC-lingo", name: "LingoLab Shorts" });
    await seedVideo(db, {
      id: "dQw4w9WgXcQ",
      title: "Never Gonna Give You Up",
      channelId: "UC-rick",
    });
    await seedVideo(db, {
      id: "GS1gK4B_Otk",
      title: "English idioms you actually hear",
      channelId: "UC-lingo",
    });

    const result = await sut.findByIds(["dQw4w9WgXcQ", "GS1gK4B_Otk"]);

    assert.ok(result.ok);
    assert.deepEqual(
      result.value,
      new Map([
        [
          "dQw4w9WgXcQ",
          {
            id: "dQw4w9WgXcQ",
            title: "Never Gonna Give You Up",
            channel: { name: "Rick Astley" },
          },
        ],
        [
          "GS1gK4B_Otk",
          {
            id: "GS1gK4B_Otk",
            title: "English idioms you actually hear",
            channel: { name: "LingoLab Shorts" },
          },
        ],
      ]),
    );
  });

  it("leaves out ids it has no video for", async () => {
    await seedChannel(db, { id: "UC-rick", name: "Rick Astley" });
    await seedVideo(db, {
      id: "dQw4w9WgXcQ",
      title: "Never Gonna Give You Up",
      channelId: "UC-rick",
    });

    const result = await sut.findByIds(["dQw4w9WgXcQ", "unknownVid1"]);

    assert.ok(result.ok);
    assert.deepEqual([...result.value.keys()], ["dQw4w9WgXcQ"]);
  });

  it("returns no videos for no ids", async () => {
    const result = await sut.findByIds([]);

    assert.deepEqual(result, { ok: true, value: new Map() });
  });
});
