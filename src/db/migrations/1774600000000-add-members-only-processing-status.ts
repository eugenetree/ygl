import { Kysely, sql } from "kysely";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function up(db: Kysely<any>): Promise<void> {
  await sql`CREATE TYPE video_job_status AS ENUM ('PENDING', 'PROCESSING', 'SUCCEEDED', 'FAILED', 'MEMBERS_ONLY')`.execute(db);
  await sql`ALTER TABLE "video_jobs" ALTER COLUMN status TYPE video_job_status USING status::text::video_job_status`.execute(db);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function down(db: Kysely<any>): Promise<void> {
  await sql`ALTER TABLE "video_jobs" ALTER COLUMN status TYPE processing_status USING status::text::processing_status`.execute(db);
  await sql`DROP TYPE video_job_status`.execute(db);
}
