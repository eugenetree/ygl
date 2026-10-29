import type { Kysely } from "kysely";
import type { Database } from "../../../db/types.js";

export async function seedChannel(db: Kysely<Database>, id: string) {
  await db
    .insertInto("channels")
    .values({
      id,
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
}

export async function seedVideo(
  db: Kysely<Database>,
  video: {
    id: string;
    channelId: string;
    captionsSimilarityScore?: number;
    manualCaptionsStatus?: "CAPTIONS_VALID" | "CAPTIONS_ABSENT";
  },
) {
  await db
    .insertInto("videos")
    .values({
      title: video.id,
      duration: 213,
      keywords: [],
      viewCount: 0,
      thumbnail: `https://i.ytimg.com/vi/${video.id}/hqdefault.jpg`,
      autoCaptionsStatus: "CAPTIONS_VALID",
      manualCaptionsStatus: "CAPTIONS_VALID",
      captionsSimilarityScore: 0.95,
      categories: [],
      ...video,
    })
    .execute();
}

let captionMinute = 0;

/** Each caption seeded is created a minute after the one before. */
export async function seedCaption(
  db: Kysely<Database>,
  caption: {
    id: string;
    videoId: string;
    type?: "manual" | "auto";
    text?: string;
  },
) {
  captionMinute += 1;
  await db
    .insertInto("captions")
    .values({
      startTime: 2500,
      endTime: 4200,
      duration: 1700,
      text: `caption ${caption.id}`,
      type: "manual",
      createdAt: new Date(Date.UTC(2026, 0, 1, 0, captionMinute)),
      ...caption,
    })
    .execute();
}

export const uuid = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

export const ids = (documents: Record<string, unknown>[]) =>
  documents.map((document) => document.id);
