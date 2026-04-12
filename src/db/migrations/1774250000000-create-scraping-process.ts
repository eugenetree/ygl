import { Kysely, sql } from "kysely";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable("scrapingProcess")
    .addColumn("id", "integer", (col) => col.primaryKey().notNull())
    .addColumn("actualStatus", "text", (col) => col.notNull().defaultTo("STOPPED"))
    .addColumn("requestedStatus", "text", (col) => col.notNull().defaultTo("STOPPED"))
    .addColumn("updatedAt", "timestamp", (col) => col.defaultTo(sql`now()`).notNull())
    .execute();

  await db.insertInto("scrapingProcess").values([
    {
      id: 1,
      actualStatus: "STOPPED",
      requestedStatus: "STOPPED",
    }
  ]).execute();
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable("scrapingProcess").execute();
}
