import { Kysely, sql } from "kysely";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function up(db: Kysely<any>): Promise<void> {
  await sql`
    CREATE OR REPLACE FUNCTION notify_scraper_requested_status_change()
    RETURNS TRIGGER AS $$
    BEGIN
      IF OLD.requested_status IS DISTINCT FROM NEW.requested_status THEN
        PERFORM pg_notify(
          'scraper_requested_status_changed',
          json_build_object(
            'old_status', OLD.requested_status,
            'new_status', NEW.requested_status
          )::text
        );
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;

    CREATE TRIGGER scraper_requested_status_change_trigger
      AFTER UPDATE ON scraping_process
      FOR EACH ROW
      EXECUTE FUNCTION notify_scraper_requested_status_change();
  `.execute(db);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function down(db: Kysely<any>): Promise<void> {
  await sql`
    DROP TRIGGER IF EXISTS scraper_requested_status_change_trigger ON scraping_process;
    DROP FUNCTION IF EXISTS notify_scraper_requested_status_change();
  `.execute(db);
}
