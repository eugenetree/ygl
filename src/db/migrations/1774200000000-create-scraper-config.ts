import { Kysely } from "kysely";
import { ScraperName } from "../../modules/scraping/constants.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable("scraperConfig")
    .addColumn("scraperName", "text", (col) => col.primaryKey())
    .addColumn("enabled", "boolean", (col) => col.notNull().defaultTo(true))
    .execute();

  await db.insertInto("scraperConfig").values([
    { scraperName: ScraperName.CHANNEL_DISCOVERY, enabled: true },
    { scraperName: ScraperName.CHANNEL, enabled: true },
    { scraperName: ScraperName.VIDEO_DISCOVERY, enabled: true },
    { scraperName: ScraperName.VIDEO, enabled: true },
  ]).execute();
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable("scraperConfig").execute();
}
