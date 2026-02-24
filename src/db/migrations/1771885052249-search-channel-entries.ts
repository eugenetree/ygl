import { Kysely, sql } from 'kysely'

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema.createType("channel_entry_status").asEnum([
    "PENDING",
    "PROCESSING",
    "ACCEPTED",
    "REJECTED",
    "FAILED",
  ]).execute();

  await db.schema
    .createTable("searchChannelEntries")
    .addColumn("id", "varchar(24)", (col) => col.primaryKey())
    .addColumn("queryId", "uuid", (col) => col.references("searchChannelViaVideosQueries.id").notNull())
    .addColumn("processingStatus", sql`channel_entry_status`, (col) => col.notNull())
    .addColumn("createdAt", "timestamp", (col) => col.notNull())
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable("searchChannelEntries").execute();
  await db.schema.dropType("channel_entry_status").execute();
}