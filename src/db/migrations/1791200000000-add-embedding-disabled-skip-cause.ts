import { Kysely, sql } from "kysely";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function up(db: Kysely<any>): Promise<void> {
  await sql`ALTER TYPE video_job_skip_cause ADD VALUE 'EMBEDDING_DISABLED'`.execute(
    db,
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function down(db: Kysely<any>): Promise<void> {
  await sql`
    CREATE TYPE video_job_skip_cause_new AS ENUM ('MEMBERS_ONLY', 'GEO_RESTRICTED', 'AGE_RESTRICTED', 'PREMIERE', 'REMOVED_BY_UPLOADER', 'CLAIMED_CONTENT', 'PREMIUM_ONLY')
  `.execute(db);

  await sql`
    ALTER TABLE "video_jobs"
    ALTER COLUMN "skip_cause" TYPE video_job_skip_cause_new
    USING (
      CASE WHEN "skip_cause"::text = 'EMBEDDING_DISABLED' THEN NULL
      ELSE "skip_cause"::text
      END
    )::video_job_skip_cause_new
  `.execute(db);

  await sql`DROP TYPE video_job_skip_cause`.execute(db);
  await sql`ALTER TYPE video_job_skip_cause_new RENAME TO video_job_skip_cause`.execute(
    db,
  );
}
