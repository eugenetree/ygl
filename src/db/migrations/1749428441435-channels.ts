import { Kysely, sql } from "kysely";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function up(db: Kysely<any>): Promise<void> {
  // Create enum type for discovery strategy
  await db.schema
    .createType("channelDiscoveryStrategy")
    .asEnum(["direct", "via-videos"])
    .execute();

  await db.schema
    .createTable("channels")
    .addColumn("id", "varchar(24)", (col) => col.primaryKey())
    .addColumn("name", "varchar", (col) => col.notNull())
    .addColumn("description", "text")
    .addColumn("avatar", "varchar")
    .addColumn("subscriberCount", "integer")
    .addColumn("viewCount", "bigint")
    .addColumn("videoCount", "integer")
    .addColumn("countryCode", "char(2)")
    .addColumn("isFamilySafe", "boolean", (col) => col.notNull())
    .addColumn("channelCreatedAt", "timestamp", (col) => col.notNull())
    .addColumn("username", "varchar", (col) => col.notNull())
    .addColumn("isArtist", "boolean", (col) => col.notNull())
    .addColumn("discoveryStrategy", sql`channel_discovery_strategy`, (col) =>
      col.notNull().defaultTo("direct"),
    )

    .addColumn("createdAt", "timestamp", (col) =>
      col.defaultTo(sql`now()`).notNull(),
    )
    .addColumn("updatedAt", "timestamp", (col) =>
      col.defaultTo(sql`now()`).notNull(),
    )
    .execute();

  // Add index for faster sorting/filtering by discovery strategy
  await db.schema
    .createIndex("idx_channels_discovery_strategy")
    .on("channels")
    .column("discoveryStrategy")
    .execute();
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function down(db: Kysely<any>): Promise<void> {
  await db.schema
    .dropIndex("idx_channels_discovery_strategy")
    .execute();

  await db.schema.dropTable("channels").execute();

  await db.schema
    .dropType("channelDiscoveryStrategy")
    .execute();
}
