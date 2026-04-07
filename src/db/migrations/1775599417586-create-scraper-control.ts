import { Kysely, sql } from "kysely";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable("scraperControl")
    .addColumn("id", "uuid", (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn("desiredState", "text", (col) => col.notNull())
    .addColumn("actualState", "text", (col) => col.notNull())
    .addColumn("heartbeatAt", "timestamptz")
    .addColumn("updatedAt", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .execute();

  await db
    .insertInto("scraperControl")
    .values({
      desiredState: "STOPPED",
      actualState: "IDLE",
      heartbeatAt: null,
    })
    .execute();
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable("scraperControl").execute();
}
