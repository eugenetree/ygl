import { Kysely, sql } from "kysely";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable("videoEntries")
    .addColumn("id", "varchar(24)", (col) => col.primaryKey())
    .addColumn("channelId", "varchar(24)", (col) => col.references("channels.id").notNull())

    .addColumn("processingStatus", sql`processing_status`, (col) => col.notNull())

    .addColumn("createdAt", "timestamp", (col) => col.defaultTo(sql`now()`).notNull())
    .addColumn("updatedAt", "timestamp", (col) => col.defaultTo(sql`now()`).notNull())
    .execute();
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable("videoEntries").execute();
  // processing_status dropped elsewhere
}
