import { Kysely, sql } from "kysely";
import { ScraperName } from "../../modules/scraping/constants.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function up(db: Kysely<any>): Promise<void> {
  // ── scrapingProcess: replace integer id PK with text instanceId ──────────
  await db.schema
    .alterTable("scrapingProcess")
    .addColumn("instanceId", "text")
    .execute();

  // migrate existing row (the singleton us instance)
  await sql`UPDATE scraping_process SET instance_id = 'us'`.execute(db);

  await sql`ALTER TABLE scraping_process ALTER COLUMN instance_id SET NOT NULL`.execute(db);
  await sql`ALTER TABLE scraping_process DROP CONSTRAINT scraping_process_pkey`.execute(db);
  await sql`ALTER TABLE scraping_process DROP COLUMN id`.execute(db);
  await sql`ALTER TABLE scraping_process ADD PRIMARY KEY (instance_id)`.execute(db);

  // ── scraperConfig: add instanceId, change PK to (instanceId, scraperName) ─
  await db.schema
    .alterTable("scraperConfig")
    .addColumn("instanceId", "text")
    .execute();

  // give existing rows the us instance id
  await sql`UPDATE scraper_config SET instance_id = 'us'`.execute(db);

  await sql`ALTER TABLE scraper_config ALTER COLUMN instance_id SET NOT NULL`.execute(db);
  await sql`ALTER TABLE scraper_config DROP CONSTRAINT scraper_config_pkey`.execute(db);
  await sql`ALTER TABLE scraper_config ADD PRIMARY KEY (instance_id, scraper_name)`.execute(db);

  // drop the seeded global config rows — each instance self-registers on boot
  await sql`DELETE FROM scraper_config`.execute(db);
  // drop the singleton scrapingProcess row — each instance self-registers on boot
  await sql`DELETE FROM scraping_process`.execute(db);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function down(db: Kysely<any>): Promise<void> {
  // restore scraperConfig
  await sql`ALTER TABLE scraper_config DROP CONSTRAINT scraper_config_pkey`.execute(db);
  await sql`ALTER TABLE scraper_config DROP COLUMN instance_id`.execute(db);
  await sql`ALTER TABLE scraper_config ADD PRIMARY KEY (scraper_name)`.execute(db);

  await db
    .insertInto("scraperConfig")
    .values([
      { scraperName: ScraperName.CHANNEL_DISCOVERY, enabled: true },
      { scraperName: ScraperName.CHANNEL, enabled: true },
      { scraperName: ScraperName.VIDEO_DISCOVERY, enabled: true },
      { scraperName: ScraperName.VIDEO, enabled: true },
    ])
    .execute();

  // restore scrapingProcess
  await sql`ALTER TABLE scraping_process DROP CONSTRAINT scraping_process_pkey`.execute(db);
  await sql`ALTER TABLE scraping_process DROP COLUMN instance_id`.execute(db);
  await sql`ALTER TABLE scraping_process ADD COLUMN id INTEGER PRIMARY KEY`.execute(db);

  await db
    .insertInto("scrapingProcess")
    .values([{ id: 1, actualStatus: "STOPPED", requestedStatus: "STOPPED" }])
    .execute();
}
