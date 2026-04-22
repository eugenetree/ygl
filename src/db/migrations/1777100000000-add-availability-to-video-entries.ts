import { Kysely, sql } from "kysely";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable("videoEntries")
    .addColumn("availability", "text", (col) => col.defaultTo("PUBLIC"))
    .execute();

  await sql`UPDATE "video_entries" SET "availability" = 'PUBLIC' WHERE "availability" IS NULL`.execute(db);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function down(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable("videoEntries")
    .dropColumn("availability")
    .execute();
}
