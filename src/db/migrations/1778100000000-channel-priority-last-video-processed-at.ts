import { Kysely, sql } from "kysely";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable("channelPriorityScores")
    .addColumn("lastVideoProcessedAt", "timestamp")
    .execute();

  await db.schema
    .createIndex("channel_priority_scores_last_video_processed_at_idx")
    .on("channelPriorityScores")
    .column("lastVideoProcessedAt")
    .execute();

  await sql`
    INSERT INTO "channel_priority_scores" ("channel_id", "score", "components", "last_video_processed_at")
    SELECT "channel_id", 0, '{}', now()
    FROM "channel_processing_stats"
    ON CONFLICT ("channel_id") DO UPDATE SET "last_video_processed_at" = now()
  `.execute(db);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function down(db: Kysely<any>): Promise<void> {
  await db.schema
    .dropIndex("channel_priority_scores_last_video_processed_at_idx")
    .execute();

  await db.schema
    .alterTable("channelPriorityScores")
    .dropColumn("lastVideoProcessedAt")
    .execute();
}
