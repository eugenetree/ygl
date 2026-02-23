import { Kysely, sql } from "kysely";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable("videos")
    .addColumn("id", "varchar(11)", (col) => col.primaryKey())
    .addColumn("title", "varchar", (col) => col.notNull())
    .addColumn("duration", "integer", (col) => col.notNull())
    .addColumn("keywords", sql`varchar[]`, (col) =>
      col.notNull().defaultTo(sql`'{}'`),
    )
    .addColumn("viewCount", "integer", (col) => col.notNull())
    .addColumn("thumbnail", "varchar", (col) => col.notNull())
    .addColumn("languageCode", "varchar")
    .addColumn("autoCaptionsStatus", "varchar", (col) => col.notNull())
    .addColumn("manualCaptionsStatus", "varchar", (col) => col.notNull())
    .addColumn("channelId", "varchar(24)", (col) =>
      col.notNull().references("channels.id"),
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
  await db.schema.dropTable("videos").execute();
}
