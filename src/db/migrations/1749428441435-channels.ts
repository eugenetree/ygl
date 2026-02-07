import { Kysely, sql } from "kysely";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable("channels")
    .addColumn("id", "varchar(24)", (col) => col.primaryKey())
    .addColumn("name", "varchar", (col) => col.notNull())
    .addColumn("description", "text")
    .addColumn("subscriberCount", "integer")
    .addColumn("viewCount", "bigint")
    .addColumn("videoCount", "integer")
    .addColumn("countryCode", "char(2)")
    .addColumn("isFamilySafe", "boolean", (col) => col.notNull())
    .addColumn("channelCreatedAt", "timestamp", (col) => col.notNull())
    .addColumn("username", "varchar", (col) => col.notNull())
    .addColumn("isArtist", "boolean", (col) => col.notNull())

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
  await db.schema.dropTable("channels").execute();
}
