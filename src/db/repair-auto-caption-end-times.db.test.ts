import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import type { Kysely } from "kysely";
import { captionsExtractor } from "../modules/youtube-api/extractors/captions.extractor.js";
import * as createFollowups from "./migrations/1792458388354-create-caption-repair-followups.js";
import { up } from "./migrations/1792458388355-repair-auto-caption-end-times.js";
import { useTestDatabase } from "./testing/test-database.js";
import type { Database } from "./types.js";

type Json3 = {
  events: {
    tStartMs: number;
    dDurationMs?: number;
    segs?: { utf8: string; tOffsetMs?: number }[];
  }[];
};

type StoredCaption = {
  text: string;
  startTime: number;
  endTime: number;
  duration: number;
};

// The repair moves the rows it updates, so physical order can't break ties.
function byTime(a: StoredCaption, b: StoredCaption): number {
  return (
    a.startTime - b.startTime ||
    a.endTime - b.endTime ||
    (a.text < b.text ? -1 : a.text > b.text ? 1 : 0)
  );
}

function readJson3(path: string): Json3 {
  return JSON.parse(readFileSync(path, "utf-8"));
}

// The last word of a line "ends" at 2 × line start + duration.
function buggyAutoCaptions(json3: Json3): StoredCaption[] {
  return json3.events.flatMap(({ tStartMs, dDurationMs = 0, segs }) => {
    if (!segs || segs.some((seg) => seg.utf8 === "\n")) return [];
    return segs.map((seg, i) => {
      const startTime = Math.round(tStartMs + (seg.tOffsetMs ?? 0));
      const endTime = Math.round(
        tStartMs + (segs[i + 1]?.tOffsetMs ?? tStartMs + dDurationMs),
      );
      return {
        text: seg.utf8,
        startTime,
        endTime,
        duration: endTime - startTime,
      };
    });
  });
}

function fixedAutoCaptions(json3: Json3): StoredCaption[] {
  const result = captionsExtractor.extractFromJson({
    jsonResponse: json3,
    type: "auto",
  });
  assert.ok(result.ok);
  return result.value
    .map(({ textSegments, startTime, endTime, duration }) => ({
      text: textSegments.map((segment) => segment.utf8).join(""),
      startTime,
      endTime,
      duration,
    }))
    .sort(byTime);
}

async function seedVideo(db: Kysely<Database>, id: string) {
  await db
    .insertInto("channels")
    .values({
      id: `UC-${id}`,
      name: id,
      viewCount: 0,
      videoCount: 0,
      isFamilySafe: true,
      channelCreatedAt: new Date(),
      username: id.toLowerCase(),
      isArtist: false,
      keywords: [],
    })
    .execute();
  await db
    .insertInto("videos")
    .values({
      id,
      title: id,
      channelId: `UC-${id}`,
      duration: 213,
      keywords: [],
      viewCount: 0,
      thumbnail: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
      autoCaptionsStatus: "CAPTIONS_VALID",
      manualCaptionsStatus: "CAPTIONS_VALID",
      categories: [],
    })
    .execute();
}

async function seedVideoWithCaptions(
  db: Kysely<Database>,
  videoId: string,
  type: "auto" | "manual",
  captions: StoredCaption[],
) {
  await seedVideo(db, videoId);
  await db
    .insertInto("captions")
    .values(
      captions.map((caption) => ({
        ...caption,
        id: randomUUID(),
        type,
        videoId,
      })),
    )
    .execute();
}

async function readCaptions(
  db: Kysely<Database>,
  videoId: string,
  type: "auto" | "manual",
): Promise<StoredCaption[]> {
  const rows = await db
    .selectFrom("captions")
    .select(["text", "startTime", "endTime", "duration"])
    .where("videoId", "=", videoId)
    .where("type", "=", type)
    .execute();
  return rows.sort(byTime);
}

describe("repair auto caption end times migration", () => {
  const db = useTestDatabase();

  it("repairs a whole video's auto captions to what the fixed extractor stores", async () => {
    const json3 = readJson3("src/fixtures/captions/raw/1s_shift_auto.json");
    await seedVideoWithCaptions(
      db,
      "1s_shift",
      "auto",
      buggyAutoCaptions(json3),
    );

    await up(db);

    assert.deepEqual(
      await readCaptions(db, "1s_shift", "auto"),
      fixedAutoCaptions(json3),
    );
  });

  it("repairs a first word whose second word YouTube placed at offset 0", async () => {
    const json3 = readJson3(
      "src/fixtures/captions/raw/second_word_at_offset_0_auto.json",
    );
    await seedVideoWithCaptions(
      db,
      "5ulGRph203M",
      "auto",
      buggyAutoCaptions(json3),
    );

    await up(db);

    assert.deepEqual(
      await readCaptions(db, "5ulGRph203M", "auto"),
      fixedAutoCaptions(json3),
    );
  });

  it("repairs the last words of overlapping lines that repeat words, in a video whose first line starts at 0", async () => {
    const overlapping = readJson3(
      "src/fixtures/captions/raw/overlapping_lines_auto.json",
    );
    const json3 = {
      events: [
        { tStartMs: 0, dDurationMs: 2720, segs: [{ utf8: "[Music]" }] },
        ...overlapping.events,
      ],
    };
    await seedVideoWithCaptions(
      db,
      "j0oTxaatnbE",
      "auto",
      buggyAutoCaptions(json3),
    );

    await up(db);

    assert.deepEqual(
      await readCaptions(db, "j0oTxaatnbE", "auto"),
      fixedAutoCaptions(json3),
    );
  });

  it("leaves correctly stored auto captions unchanged, even an inner word whose repeated copy sorts before its next word", async () => {
    const line = (tStartMs: number, words: [string, number][]) => ({
      tStartMs,
      dDurationMs: 3000,
      segs: words.map(([utf8, tOffsetMs]) => ({ utf8, tOffsetMs })),
    });
    const json3 = {
      events: [
        line(0, [["[Music]", 0]]),
        line(2000, [["one", 0]]),
        line(4000, [["two", 0]]),
        line(6000, [["three", 0]]),
        line(8000, [["four", 0]]),
        line(10000, [
          ["we", 0],
          [" were", 400],
          [" fortunate", 800],
        ]),
        line(10500, [
          ["were", 0],
          [" fortunate", 350],
          [" to", 800],
        ]),
      ],
    };
    const fixed = fixedAutoCaptions(json3);
    await seedVideoWithCaptions(db, "overlapping", "auto", fixed);

    await up(db);

    assert.deepEqual(await readCaptions(db, "overlapping", "auto"), fixed);
  });

  it("repairs rows inserted out of time order", async () => {
    const json3 = readJson3("src/fixtures/captions/raw/1s_shift_auto.json");
    await seedVideoWithCaptions(
      db,
      "1s_shift",
      "auto",
      buggyAutoCaptions(json3).reverse(),
    );

    await up(db);

    assert.deepEqual(
      await readCaptions(db, "1s_shift", "auto"),
      fixedAutoCaptions(json3),
    );
  });

  it("treats a video's first row as a line start even when it begins with a space", async () => {
    const json3 = {
      events: [
        {
          tStartMs: 1200,
          dDurationMs: 3000,
          segs: [{ utf8: " 155" }, { utf8: " people", tOffsetMs: 640 }],
        },
        { tStartMs: 3090, dDurationMs: 1110, segs: [{ utf8: "\n" }] },
        {
          tStartMs: 3100,
          dDurationMs: 2000,
          segs: [{ utf8: "died" }, { utf8: " there", tOffsetMs: 400 }],
        },
      ],
    };
    await seedVideoWithCaptions(
      db,
      "-AU27sMNNN0",
      "auto",
      buggyAutoCaptions(json3),
    );

    await up(db);

    assert.deepEqual(await readCaptions(db, "-AU27sMNNN0", "auto"), [
      { text: " 155", startTime: 1200, endTime: 1840, duration: 640 },
      { text: " people", startTime: 1840, endTime: 3100, duration: 1260 },
      { text: "died", startTime: 3100, endTime: 3500, duration: 400 },
      { text: " there", startTime: 3500, endTime: 5100, duration: 1600 },
    ]);
  });

  it("repairs block-level auto captions, including blocks that begin with a line break", async () => {
    const json3 = {
      events: [
        {
          tStartMs: 1040,
          dDurationMs: 4320,
          segs: [{ utf8: "so today we're going to\ntalk about" }],
        },
        {
          tStartMs: 3600,
          dDurationMs: 4100,
          segs: [{ utf8: "\nhow the court decides" }],
        },
        {
          tStartMs: 7700,
          dDurationMs: 3000,
          segs: [{ utf8: "which cases to hear" }],
        },
      ],
    };
    await seedVideoWithCaptions(
      db,
      "blockLevel1",
      "auto",
      buggyAutoCaptions(json3),
    );

    await up(db);

    assert.deepEqual(await readCaptions(db, "blockLevel1", "auto"), [
      {
        text: "so today we're going to\ntalk about",
        startTime: 1040,
        endTime: 3600,
        duration: 2560,
      },
      {
        text: "\nhow the court decides",
        startTime: 3600,
        endTime: 7700,
        duration: 4100,
      },
      {
        text: "which cases to hear",
        startTime: 7700,
        endTime: 10700,
        duration: 3000,
      },
    ]);
  });

  it("ends every segment of a block-level caption at the next block's start, never after its own block's end", async () => {
    const block = (tStartMs: number, dDurationMs: number, texts: string[]) => ({
      tStartMs,
      dDurationMs,
      segs: texts.map((utf8) => ({ utf8 })),
    });
    const json3 = {
      events: [
        block(0, 5339, [
          "other thing that happened in the past 24\nhours this is congresswoman",
          " Marjorie",
        ]),
        block(3419, 5521, [
          "Taylor green",
          " she's",
          " planning",
          " a protest by\nthe way here in New York ahead of",
        ]),
        block(6660, 6000, ["Trump's", " arraignment"]),
        block(10740, 7500, ["she said on 60 Minutes last night here\nshe is"]),
        block(19000, 3000, ["the Democrats", " are"]),
      ],
    };
    await seedVideoWithCaptions(
      db,
      "4FRvd460mQc",
      "auto",
      buggyAutoCaptions(json3),
    );

    await up(db);

    const endsByText = Object.fromEntries(
      (await readCaptions(db, "4FRvd460mQc", "auto")).map(
        ({ text, endTime }) => [text, endTime],
      ),
    );
    assert.deepEqual(endsByText, {
      "other thing that happened in the past 24\nhours this is congresswoman": 3419,
      " Marjorie": 3419,
      "Taylor green": 6660,
      " she's": 6660,
      " planning": 6660,
      " a protest by\nthe way here in New York ahead of": 6660,
      "Trump's": 10740,
      " arraignment": 10740,
      "she said on 60 Minutes last night here\nshe is": 18240,
      "the Democrats": 22000,
      " are": 22000,
    });
  });

  it("ends a block-level segment followed by one that begins with a line break at the next block's start", async () => {
    const block = (tStartMs: number, dDurationMs: number, texts: string[]) => ({
      tStartMs,
      dDurationMs,
      segs: texts.map((utf8) => ({ utf8 })),
    });
    const json3 = {
      events: [
        block(23400, 6959, [
          "that this is ukrainians",
          " deciding",
          " to",
          " use",
          "\nthese Munitions on their soil not",
        ]),
        block(28080, 7380, [
          "someone else's soil in the process",
          " of",
          "\nliberating their territory put on your",
        ]),
        block(32399, 7500, ["CIA director cap", " moment what do", "\nyou"]),
      ],
    };
    await seedVideoWithCaptions(
      db,
      "-AU27sMNNN0",
      "auto",
      buggyAutoCaptions(json3),
    );

    await up(db);

    assert.deepEqual(
      await readCaptions(db, "-AU27sMNNN0", "auto"),
      fixedAutoCaptions(json3),
    );
  });

  it("leaves manual captions unchanged", async () => {
    const manual = [
      { text: "So today", startTime: 1040, endTime: 3600, duration: 2560 },
      { text: " we talk", startTime: 3600, endTime: 9000, duration: 5400 },
    ];
    await seedVideoWithCaptions(db, "manualOnly1", "manual", manual);

    await up(db);

    assert.deepEqual(await readCaptions(db, "manualOnly1", "manual"), manual);
  });

  it("repairs each video from its own rows when several are stored", async () => {
    const oneSecond = readJson3("src/fixtures/captions/raw/1s_shift_auto.json");
    const threeSeconds = readJson3(
      "src/fixtures/captions/raw/3s_shift_auto.json",
    );
    await seedVideoWithCaptions(
      db,
      "1s_shift",
      "auto",
      buggyAutoCaptions(oneSecond),
    );
    await seedVideoWithCaptions(
      db,
      "3s_shift",
      "auto",
      buggyAutoCaptions(threeSeconds),
    );

    await up(db);

    assert.deepEqual(
      await readCaptions(db, "1s_shift", "auto"),
      fixedAutoCaptions(oneSecond),
    );
    assert.deepEqual(
      await readCaptions(db, "3s_shift", "auto"),
      fixedAutoCaptions(threeSeconds),
    );
  });
});

describe("create caption repair followups migration", () => {
  const db = useTestDatabase();

  it("marks only the videos whose auto captions are block-level", async () => {
    const blockLevel = {
      events: [
        {
          tStartMs: 1040,
          dDurationMs: 4320,
          segs: [{ utf8: "so today we're going to\ntalk about" }],
        },
      ],
    };
    await seedVideoWithCaptions(
      db,
      "blockLevel1",
      "auto",
      buggyAutoCaptions(blockLevel),
    );
    await seedVideoWithCaptions(
      db,
      "1s_shift",
      "auto",
      buggyAutoCaptions(
        readJson3("src/fixtures/captions/raw/1s_shift_auto.json"),
      ),
    );
    await seedVideoWithCaptions(db, "manualOnly1", "manual", [
      {
        text: "So today\nwe talk",
        startTime: 1040,
        endTime: 3600,
        duration: 2560,
      },
    ]);

    await createFollowups.down(db);
    await createFollowups.up(db);

    assert.deepEqual(
      await db
        .selectFrom("captionRepairFollowups")
        .select(["videoId", "reason"])
        .execute(),
      [{ videoId: "blockLevel1", reason: "block_level" }],
    );
  });
});
