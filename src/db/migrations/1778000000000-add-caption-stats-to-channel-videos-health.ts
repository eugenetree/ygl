import { Kysely, sql } from "kysely";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable("channelProcessingStats")
    .addColumn("id", "uuid", (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn("channelId", "varchar(24)", (col) =>
      col.references("channels.id").notNull().unique(),
    )
    .addColumn("totalProcessedCount", "integer", (col) => col.defaultTo(0).notNull())
    .addColumn("validCaptionsCount", "integer", (col) => col.defaultTo(0).notNull())
    .addColumn("createdAt", "timestamp", (col) => col.defaultTo(sql`now()`).notNull())
    .addColumn("updatedAt", "timestamp", (col) => col.defaultTo(sql`now()`).notNull())
    .execute();

  await sql`
    INSERT INTO "channel_processing_stats" ("id", "channel_id", "total_processed_count", "valid_captions_count", "created_at", "updated_at")
    SELECT
      gen_random_uuid(),
      v."channel_id",
      COUNT(*),
      COUNT(*) FILTER (
        WHERE v."auto_captions_status" = 'CAPTIONS_VALID'
          AND v."manual_captions_status" = 'CAPTIONS_VALID'
      ),
      now(),
      now()
    FROM videos v
    WHERE EXISTS (SELECT 1 FROM channels c WHERE c.id = v."channel_id")
    GROUP BY v."channel_id"
  `.execute(db);

  await db.schema.dropTable("channelVideosHealth").execute();
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function down(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable("channelVideosHealth")
    .addColumn("id", "uuid", (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn("channelId", "varchar(24)", (col) =>
      col.references("channels.id").notNull().unique(),
    )
    .addColumn("succeededVideosStreak", "integer", (col) => col.defaultTo(0).notNull())
    .addColumn("failedVideosStreak", "integer", (col) => col.defaultTo(0).notNull())
    .addColumn("createdAt", "timestamp", (col) => col.defaultTo(sql`now()`).notNull())
    .addColumn("updatedAt", "timestamp", (col) => col.defaultTo(sql`now()`).notNull())
    .execute();

  await db.schema.dropTable("channelProcessingStats").execute();
}
