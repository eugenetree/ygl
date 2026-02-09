import { Kysely, sql } from "kysely";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable("elasticCaptionsSync")
    .addColumn("id", "uuid", (col) => col.primaryKey())
    
    .addColumn("syncStatus", "varchar", (col) => col.notNull())
    .addColumn("syncStartedAt", "timestamp")
    .addColumn("syncCompletedAt", "timestamp")
    .addColumn("latestSyncedCaptionId", "uuid")

    .addColumn("failReason", "varchar")

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
