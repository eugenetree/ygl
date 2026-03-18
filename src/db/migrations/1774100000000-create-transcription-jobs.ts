import { Kysely, sql } from "kysely";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable("transcriptionJobs")
    .addColumn("id", "uuid", (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn("videoId", "varchar(24)", (col) =>
      col.references("videos.id").notNull().unique(),
    )
    .addColumn("status", sql`processing_status`, (col) => col.notNull())
    .addColumn("statusUpdatedAt", "timestamp")
    .addColumn("createdAt", "timestamp", (col) => col.defaultTo(sql`now()`).notNull())
    .execute();
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable("transcriptionJobs").execute();
}
