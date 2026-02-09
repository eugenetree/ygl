import { Kysely, sql } from "kysely";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createType("queryProcessingStatus")
    .asEnum(["NOT_STARTED", "IN_PROGRESS", "SUCCESS", "FAIL"])
    .execute();

  await db.schema
    .createTable("searchChannelDirectQueries")
    .addColumn("id", "uuid", (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`),
    )

    .addColumn("query", "varchar", (col) => col.unique().notNull())
    .addColumn("processingStatus", sql`query_processing_status`, (col) =>
      col.defaultTo("NOT_STARTED").notNull(),
    )
    .addColumn("processingStatusUpdatedAt", "timestamp")

    .addColumn("createdAt", "timestamp", (col) =>
      col.defaultTo(sql`now()`).notNull(),
    )
    .addColumn("updatedAt", "timestamp", (col) =>
      col.defaultTo(sql`now()`).notNull(),
    )
    .execute();
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable("searchChannelDirectQueries").execute();
}
