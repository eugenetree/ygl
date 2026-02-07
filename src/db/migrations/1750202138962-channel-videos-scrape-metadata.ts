import { Kysely, sql } from "kysely";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable("channelVideosScrapeMetadata")
    .addColumn("id", "uuid", (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`),
    )

    .addColumn("processingStatus", "varchar", (col) => col.notNull())
    .addColumn("processingStartedAt", "timestamp")
    .addColumn("processingCompletedAt", "timestamp")

    .addColumn("failReason", "varchar")

    .addColumn("videosWithValidCaptionsCount", "integer", (col) =>
      col.notNull(),
    )
    .addColumn("videosWithNoCaptionsCount", "integer", (col) => col.notNull())
    .addColumn("videosWithNotSuitableCaptionsCount", "integer", (col) =>
      col.notNull(),
    )
    .addColumn("consecutiveFailedVideosCount", "integer", (col) =>
      col.notNull(),
    )
    .addColumn("totalFailedVideosCount", "integer", (col) => col.notNull())
    .addColumn("processedVideosCount", "integer", (col) => col.notNull())

    .addColumn("channelId", "varchar(24)", (col) =>
      col.references("channels.id").onDelete("cascade").notNull(),
    )

    .addColumn("createdAt", "timestamp", (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addColumn("updatedAt", "timestamp", (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .execute();
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable("channelVideosScrapeMetadata").execute();
}
