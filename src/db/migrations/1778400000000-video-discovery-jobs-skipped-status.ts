import { Kysely, sql } from "kysely";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function up(db: Kysely<any>): Promise<void> {
  await sql`CREATE TYPE video_discovery_job_skip_cause AS ENUM ('CHANNEL_NOT_FOUND')`.execute(db);

  await db.schema
    .alterTable("videoDiscoveryJobs")
    .addColumn("skipCause", sql`video_discovery_job_skip_cause`)
    .execute();

  await sql`CREATE TYPE video_discovery_job_status AS ENUM ('PENDING', 'PROCESSING', 'SUCCEEDED', 'FAILED', 'SKIPPED')`.execute(db);
  await sql`
    ALTER TABLE "video_discovery_jobs"
    ALTER COLUMN status TYPE video_discovery_job_status
    USING status::text::video_discovery_job_status
  `.execute(db);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function down(db: Kysely<any>): Promise<void> {
  await sql`
    ALTER TABLE "video_discovery_jobs"
    ALTER COLUMN status TYPE processing_status
    USING (
      CASE WHEN status::text = 'SKIPPED' THEN 'FAILED'
      ELSE status::text
      END
    )::processing_status
  `.execute(db);
  await sql`DROP TYPE video_discovery_job_status`.execute(db);

  await db.schema.alterTable("videoDiscoveryJobs").dropColumn("skipCause").execute();
  await sql`DROP TYPE video_discovery_job_skip_cause`.execute(db);
}
