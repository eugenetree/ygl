import { Kysely, sql } from "kysely";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function up(db: Kysely<any>): Promise<void> {
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
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable("channelVideosHealth").execute();
}
