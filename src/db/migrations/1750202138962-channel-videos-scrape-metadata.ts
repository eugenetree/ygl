import { Kysely, sql } from "kysely";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable("channelVideosScrapeMetadata")
    .addColumn("id", "uuid", (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`),
    )

    .addColumn("firstVideoId", "varchar(11)")
    .addColumn("lastVideoId", "varchar(11)")

    .addColumn("processingStatus", "varchar", (col) => col.notNull())
    .addColumn("processingStartedAt", "timestamp")
    .addColumn("processingCompletedAt", "timestamp")

    .addColumn("failureReason", "varchar")
    .addColumn("terminationReason", "varchar")

    .addColumn("videosBothCaptionsValid", "integer", (col) =>
      col.notNull(),
    )
    .addColumn("videosNoCaptionsValid", "integer", (col) => col.notNull())
    .addColumn("videosOnlyManualCaptionsValid", "integer", (col) =>
      col.notNull(),
    )
    .addColumn("videosOnlyAutoCaptionsValid", "integer", (col) =>
      col.notNull(),
    )
    .addColumn("videosAll", "integer", (col) => col.notNull())
    .addColumn("videosSkippedAlreadyProcessed", "integer", (col) =>
      col.notNull(),
    )
    .addColumn("videosFailed", "integer", (col) => col.notNull())
    .addColumn("videosProcessed", "integer", (col) => col.notNull())

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
