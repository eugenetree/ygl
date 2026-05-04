import { Kysely, sql } from "kysely";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable("boostedChannels")
    .addColumn("channelId", "varchar(24)", (col) => col.primaryKey())
    .addColumn("createdAt", "timestamp", (col) => col.defaultTo(sql`now()`).notNull())
    .execute();

  await db.schema
    .createTable("channelPriorityScores")
    .addColumn("channelId", "varchar(24)", (col) => col.primaryKey())
    .addColumn("score", "float8", (col) => col.notNull().defaultTo(0))
    .addColumn("components", "jsonb", (col) => col.notNull().defaultTo(sql`'{}'`))
    .addColumn("calculatedAt", "timestamp")
    .execute();

  await db.schema
    .alterTable("channelEntries")
    .alterColumn("queryId", (col) => col.dropNotNull())
    .execute();

  await db.schema
    .alterTable("channelJobs")
    .addColumn("priority", "float8", (col) => col.notNull().defaultTo(0))
    .execute();

  await db.schema
    .alterTable("videoDiscoveryJobs")
    .addColumn("priority", "float8", (col) => col.notNull().defaultTo(0))
    .execute();

  await db.schema
    .alterTable("videoJobs")
    .addColumn("priority", "float8", (col) => col.notNull().defaultTo(0))
    .execute();

  await sql`CREATE INDEX ON "channel_jobs" (id) WHERE priority > 0 AND status = 'PENDING'`.execute(db);
  await sql`CREATE INDEX ON "video_discovery_jobs" (id) WHERE priority > 0 AND status = 'PENDING'`.execute(db);
  await sql`CREATE INDEX ON "video_jobs" (id) WHERE priority > 0 AND status = 'PENDING'`.execute(db);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.alterTable("videoJobs").dropColumn("priority").execute();
  await db.schema.alterTable("videoDiscoveryJobs").dropColumn("priority").execute();
  await db.schema.alterTable("channelJobs").dropColumn("priority").execute();

  await db.schema.alterTable("channelEntries").alterColumn("queryId", (col) => col.setNotNull()).execute();

  await db.schema.dropTable("channelPriorityScores").execute();
  await db.schema.dropTable("boostedChannels").execute();
}
