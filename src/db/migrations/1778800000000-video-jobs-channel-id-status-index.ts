import { Kysely } from "kysely";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createIndex("video_jobs_channel_id_status_idx")
    .ifNotExists()
    .on("videoJobs")
    .columns(["channelId", "status"])
    .execute();
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function down(db: Kysely<any>): Promise<void> {
  await db.schema
    .dropIndex("video_jobs_channel_id_status_idx")
    .ifExists()
    .execute();
}
