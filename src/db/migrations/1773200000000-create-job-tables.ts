import { Kysely, sql } from "kysely";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable("channelDiscoveryJobs")
    .addColumn("id", "uuid", (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn("searchQueryId", "varchar", (col) =>
      col.references("searchChannelQueries.id").notNull().unique(),
    )
    .addColumn("status", sql`processing_status`, (col) => col.notNull())
    .addColumn("statusUpdatedAt", "timestamp")
    .addColumn("createdAt", "timestamp", (col) => col.defaultTo(sql`now()`).notNull())
    .execute();

  await db.schema
    .createTable("channelJobs")
    .addColumn("id", "uuid", (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn("channelId", "varchar(24)", (col) =>
      col.references("channelEntries.id").notNull().unique(),
    )
    .addColumn("status", sql`processing_status`, (col) => col.notNull())
    .addColumn("statusUpdatedAt", "timestamp")
    .addColumn("createdAt", "timestamp", (col) => col.defaultTo(sql`now()`).notNull())
    .execute();

  await db.schema
    .createTable("videoDiscoveryJobs")
    .addColumn("id", "uuid", (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn("channelId", "varchar(24)", (col) =>
      col.references("channels.id").notNull().unique(),
    )
    .addColumn("status", sql`processing_status`, (col) => col.notNull())
    .addColumn("statusUpdatedAt", "timestamp")
    .addColumn("createdAt", "timestamp", (col) => col.defaultTo(sql`now()`).notNull())
    .execute();

  await db.schema
    .createTable("videoJobs")
    .addColumn("id", "uuid", (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn("videoId", "varchar(24)", (col) =>
      col.references("videoEntries.id").notNull().unique(),
    )
    .addColumn("channelId", "varchar(24)", (col) =>
      col.references("channels.id").notNull(),
    )
    .addColumn("status", sql`processing_status`, (col) => col.notNull())
    .addColumn("statusUpdatedAt", "timestamp")
    .addColumn("createdAt", "timestamp", (col) => col.defaultTo(sql`now()`).notNull())
    .execute();
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable("videoJobs").execute();
  await db.schema.dropTable("videoDiscoveryJobs").execute();
  await db.schema.dropTable("channelJobs").execute();
  await db.schema.dropTable("channelDiscoveryJobs").execute();
}
