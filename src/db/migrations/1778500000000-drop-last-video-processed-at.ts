import { type Kysely, sql } from "kysely";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .dropIndex("channel_priority_scores_last_video_processed_at_idx")
    .ifExists()
    .execute();

  await db.schema
    .alterTable("channelPriorityScores")
    .dropColumn("lastVideoProcessedAt")
    .execute();

  await db.schema
    .createIndex("channel_priority_scores_calculated_at_idx")
    .on("channelPriorityScores")
    .column("calculatedAt")
    .execute();

  await db.schema
    .createIndex("videos_channel_id_created_at_idx")
    .ifNotExists()
    .on("videos")
    .columns(["channelId", "createdAt"])
    .execute();
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function down(db: Kysely<any>): Promise<void> {
  await db.schema
    .dropIndex("videos_channel_id_created_at_idx")
    .ifExists()
    .execute();

  await db.schema
    .dropIndex("channel_priority_scores_calculated_at_idx")
    .execute();

  await db.schema
    .alterTable("channelPriorityScores")
    .addColumn("lastVideoProcessedAt", "timestamp")
    .execute();

  await db.schema
    .createIndex("channel_priority_scores_last_video_processed_at_idx")
    .on("channelPriorityScores")
    .column("lastVideoProcessedAt")
    .execute();

  await sql`UPDATE "channel_priority_scores" SET "last_video_processed_at" = now()`.execute(
    db,
  );
}
