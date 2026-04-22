import { Kysely, sql } from "kysely";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function up(db: Kysely<any>): Promise<void> {
  await sql`CREATE TYPE video_job_skip_cause AS ENUM ('MEMBERS_ONLY', 'GEO_RESTRICTED')`.execute(db);

  await db.schema
    .alterTable("videoJobs")
    .addColumn("skipCause", sql`video_job_skip_cause`)
    .execute();

  await sql`UPDATE "video_jobs" SET "skip_cause" = 'MEMBERS_ONLY' WHERE "status" = 'MEMBERS_ONLY'`.execute(db);

  await sql`CREATE TYPE video_job_status_new AS ENUM ('PENDING', 'PROCESSING', 'SUCCEEDED', 'FAILED', 'SKIPPED')`.execute(db);
  await sql`
    ALTER TABLE "video_jobs"
    ALTER COLUMN status TYPE video_job_status_new
    USING (CASE WHEN status::text = 'MEMBERS_ONLY' THEN 'SKIPPED' ELSE status::text END)::video_job_status_new
  `.execute(db);
  await sql`DROP TYPE video_job_status`.execute(db);
  await sql`ALTER TYPE video_job_status_new RENAME TO video_job_status`.execute(db);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function down(db: Kysely<any>): Promise<void> {
  await sql`CREATE TYPE video_job_status_old AS ENUM ('PENDING', 'PROCESSING', 'SUCCEEDED', 'FAILED', 'MEMBERS_ONLY')`.execute(db);
  await sql`
    ALTER TABLE "video_jobs"
    ALTER COLUMN status TYPE video_job_status_old
    USING (
      CASE
        WHEN status::text = 'SKIPPED' AND "skip_cause"::text = 'MEMBERS_ONLY' THEN 'MEMBERS_ONLY'
        WHEN status::text = 'SKIPPED' THEN 'FAILED'
        ELSE status::text
      END
    )::video_job_status_old
  `.execute(db);
  await sql`DROP TYPE video_job_status`.execute(db);
  await sql`ALTER TYPE video_job_status_old RENAME TO video_job_status`.execute(db);

  await db.schema.alterTable("videoJobs").dropColumn("skipCause").execute();
  await sql`DROP TYPE video_job_skip_cause`.execute(db);
}
