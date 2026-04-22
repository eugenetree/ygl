import { Kysely, sql } from "kysely";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function up(db: Kysely<any>): Promise<void> {
  await sql`UPDATE "video_entries" SET "availability" = 'PUBLIC' WHERE "availability" IS NULL`.execute(db);

  await db.schema
    .alterTable("videoEntries")
    .alterColumn("availability", (col) => col.setNotNull())
    .execute();

  await sql`ALTER TABLE "video_entries" ADD CONSTRAINT "video_entries_availability_check" CHECK ("availability" IN ('PUBLIC', 'MEMBERS_ONLY'))`.execute(db);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function down(db: Kysely<any>): Promise<void> {
  await sql`ALTER TABLE "video_entries" DROP CONSTRAINT "video_entries_availability_check"`.execute(db);

  await db.schema
    .alterTable("videoEntries")
    .alterColumn("availability", (col) => col.dropNotNull())
    .execute();
}
