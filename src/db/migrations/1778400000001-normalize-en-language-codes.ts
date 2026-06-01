import type { Kysely } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  await db
    .updateTable("videos")
    .set({ language_code: "en" })
    .where("language_code", "like", "en-%")
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {}
