import { Kysely, sql } from "kysely";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable("captions")
    .addColumn("id", "uuid", (col) => col.primaryKey())
    .addColumn("startTime", "integer", (col) => col.notNull())
    .addColumn("endTime", "integer", (col) => col.notNull())
    .addColumn("duration", "integer", (col) => col.notNull())
    .addColumn("text", "text", (col) => col.notNull())
    .addColumn("type", "varchar(6)", (col) => col.notNull())
    .addColumn("videoId", "varchar(11)", (col) =>
      col.notNull().references("videos.id"),
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
