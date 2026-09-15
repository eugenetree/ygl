import { Kysely, sql } from "kysely";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function up(db: Kysely<any>): Promise<void> {
  await sql`ALTER TYPE video_discovery_job_skip_cause ADD VALUE 'NO_VIDEOS_TAB'`.execute(
    db,
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function down(db: Kysely<any>): Promise<void> {
  await sql`
    CREATE TYPE video_discovery_job_skip_cause_new AS ENUM ('CHANNEL_NOT_FOUND')
  `.execute(db);

  await sql`
    ALTER TABLE "video_discovery_jobs"
    ALTER COLUMN "skip_cause" TYPE video_discovery_job_skip_cause_new
    USING (
      CASE WHEN "skip_cause"::text = 'NO_VIDEOS_TAB' THEN NULL
      ELSE "skip_cause"::text
      END
    )::video_discovery_job_skip_cause_new
  `.execute(db);

  await sql`DROP TYPE video_discovery_job_skip_cause`.execute(db);
  await sql`ALTER TYPE video_discovery_job_skip_cause_new RENAME TO video_discovery_job_skip_cause`.execute(
    db,
  );
}
