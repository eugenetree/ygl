import { Kysely, sql } from 'kysely'

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable("searchChannelEntries")
    .addColumn("id", "varchar(24)", (col) => col.primaryKey())
    .addColumn("queryId", "uuid", (col) => col.references("searchChannelQueries.id").notNull())

    .addColumn("processingStatus", sql`processing_status`, (col) => col.notNull())

    .addColumn("createdAt", "timestamp", (col) => col.defaultTo(sql`now()`).notNull())
    .addColumn("updatedAt", "timestamp", (col) => col.defaultTo(sql`now()`).notNull())
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable("searchChannelEntries").execute();
}