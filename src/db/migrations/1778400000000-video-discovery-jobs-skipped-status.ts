import { type Kysely, sql } from "kysely";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function up(db: Kysely<any>): Promise<void> {
  await sql`CREATE TYPE video_discovery_job_skip_cause AS ENUM ('CHANNEL_NOT_FOUND')`.execute(
    db,
  );

  await db.schema
    .alterTable("videoDiscoveryJobs")
    .addColumn("skipCause", sql`video_discovery_job_skip_cause`)
    .execute();

  await sql`CREATE TYPE video_discovery_job_status AS ENUM ('PENDING', 'PROCESSING', 'SUCCEEDED', 'FAILED', 'SKIPPED')`.execute(
    db,
  );
  // Drop the partial index whose predicate (status = 'PENDING') is bound to the
  // old processing_status type; it would block ALTER COLUMN TYPE.
  await sql`DROP INDEX IF EXISTS video_discovery_jobs_id_idx`.execute(db);
  await sql`
    ALTER TABLE "video_discovery_jobs"
    ALTER COLUMN status TYPE video_discovery_job_status
    USING status::text::video_discovery_job_status
  `.execute(db);
  await sql`CREATE INDEX ON "video_discovery_jobs" (id) WHERE priority > 0 AND status = 'PENDING'`.execute(
    db,
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function down(db: Kysely<any>): Promise<void> {
  await sql`DROP INDEX IF EXISTS video_discovery_jobs_id_idx`.execute(db);
  await sql`
    ALTER TABLE "video_discovery_jobs"
    ALTER COLUMN status TYPE processing_status
    USING (
      CASE WHEN status::text = 'SKIPPED' THEN 'FAILED'
      ELSE status::text
      END
    )::processing_status
  `.execute(db);
  await sql`CREATE INDEX ON "video_discovery_jobs" (id) WHERE priority > 0 AND status = 'PENDING'`.execute(
    db,
  );
  await sql`DROP TYPE video_discovery_job_status`.execute(db);

  await db.schema
    .alterTable("videoDiscoveryJobs")
    .dropColumn("skipCause")
    .execute();
  await sql`DROP TYPE video_discovery_job_skip_cause`.execute(db);
}
