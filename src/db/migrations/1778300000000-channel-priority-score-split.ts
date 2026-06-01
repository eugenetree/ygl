import type { Kysely } from "kysely";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable("channelPriorityScores")
    .renameColumn("score", "scrapingScore")
    .execute();

  await db.schema
    .alterTable("channelPriorityScores")
    .addColumn("searchScore", "float8", (col) => col.notNull().defaultTo(0))
    .execute();
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function down(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable("channelPriorityScores")
    .dropColumn("searchScore")
    .execute();

  await db.schema
    .alterTable("channelPriorityScores")
    .renameColumn("scrapingScore", "score")
    .execute();
}
