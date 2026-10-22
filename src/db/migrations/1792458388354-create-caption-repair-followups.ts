import { Kysely, sql } from "kysely";

// Videos whose stored captions the repair can't make exact, kept until they're
// refetched. Block-level auto captions lost their word timings, and they're the
// only auto rows with a line break in the text.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable("captionRepairFollowups")
    .addColumn("videoId", "varchar(11)", (col) =>
      col.references("videos.id").onDelete("cascade").notNull(),
    )
    .addColumn("reason", "text", (col) => col.notNull())
    .addColumn("createdAt", "timestamptz", (col) =>
      col.defaultTo(sql`now()`).notNull(),
    )
    .addPrimaryKeyConstraint("caption_repair_followups_pkey", [
      "videoId",
      "reason",
    ])
    .execute();

  await sql`
    INSERT INTO caption_repair_followups (video_id, reason)
    SELECT DISTINCT video_id, 'block_level'
    FROM captions
    WHERE type = 'auto' AND position(chr(10) IN text) > 0
  `.execute(db);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable("captionRepairFollowups").execute();
}
