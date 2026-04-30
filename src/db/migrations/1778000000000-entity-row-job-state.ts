import { Kysely, sql } from "kysely";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function up(db: Kysely<any>): Promise<void> {
  // searchChannelQueries: channelDiscovery stage
  await sql`
    ALTER TABLE "search_channel_queries"
      ADD COLUMN "channel_discovery_status" text NOT NULL DEFAULT 'PENDING',
      ADD COLUMN "channel_discovery_error" text,
      ADD COLUMN "channel_discovery_status_updated_at" timestamp
  `.execute(db);

  await sql`
    UPDATE "search_channel_queries" q
    SET
      "channel_discovery_status" = CASE j.status
        WHEN 'SUCCEEDED' THEN 'SUCCEEDED'
        WHEN 'FAILED' THEN 'FAILED'
        ELSE 'PENDING'
      END,
      "channel_discovery_status_updated_at" = j."status_updated_at"
    FROM "channel_discovery_jobs" j WHERE j."search_query_id" = q.id
  `.execute(db);

  await sql`
    CREATE INDEX "search_channel_queries_channel_discovery_pending"
    ON "search_channel_queries" (id)
    WHERE "channel_discovery_status" = 'PENDING'
  `.execute(db);

  // channelEntries: channelProcess stage
  await sql`
    ALTER TABLE "channel_entries"
      ADD COLUMN "channel_process_status" text NOT NULL DEFAULT 'PENDING',
      ADD COLUMN "channel_process_error" text,
      ADD COLUMN "channel_process_status_updated_at" timestamp
  `.execute(db);

  await sql`
    UPDATE "channel_entries" e
    SET
      "channel_process_status" = CASE j.status
        WHEN 'SUCCEEDED' THEN 'SUCCEEDED'
        WHEN 'FAILED' THEN 'FAILED'
        ELSE 'PENDING'
      END,
      "channel_process_status_updated_at" = j."status_updated_at"
    FROM "channel_jobs" j WHERE j."channel_id" = e.id
  `.execute(db);

  await sql`
    CREATE INDEX "channel_entries_channel_process_pending"
    ON "channel_entries" (id)
    WHERE "channel_process_status" = 'PENDING'
  `.execute(db);

  // channels: videoDiscovery stage
  await sql`
    ALTER TABLE "channels"
      ADD COLUMN "video_discovery_status" text NOT NULL DEFAULT 'PENDING',
      ADD COLUMN "video_discovery_error" text,
      ADD COLUMN "video_discovery_status_updated_at" timestamp
  `.execute(db);

  await sql`
    UPDATE "channels" c
    SET
      "video_discovery_status" = CASE j.status
        WHEN 'SUCCEEDED' THEN 'SUCCEEDED'
        WHEN 'FAILED' THEN 'FAILED'
        ELSE 'PENDING'
      END,
      "video_discovery_status_updated_at" = j."status_updated_at"
    FROM "video_discovery_jobs" j WHERE j."channel_id" = c.id
  `.execute(db);

  await sql`
    CREATE INDEX "channels_video_discovery_pending"
    ON "channels" (id)
    WHERE "video_discovery_status" = 'PENDING'
  `.execute(db);

  // videoEntries: videoProcess stage (nullable — NULL means not applicable)
  await sql`
    ALTER TABLE "video_entries"
      ADD COLUMN "video_process_status" text,
      ADD COLUMN "video_process_error" text,
      ADD COLUMN "video_process_status_updated_at" timestamp
  `.execute(db);

  await sql`
    UPDATE "video_entries" e
    SET
      "video_process_status" = CASE j.status
        WHEN 'SUCCEEDED' THEN 'SUCCEEDED'
        WHEN 'FAILED' THEN 'FAILED'
        WHEN 'SKIPPED' THEN 'SKIPPED'
        ELSE 'PENDING'
      END,
      "video_process_error" = j."skip_cause",
      "video_process_status_updated_at" = j."status_updated_at"
    FROM "video_jobs" j WHERE j."video_id" = e.id
  `.execute(db);

  await sql`
    CREATE INDEX "video_entries_video_process_pending"
    ON "video_entries" (id)
    WHERE "video_process_status" = 'PENDING'
  `.execute(db);

  // videos: transcription stage (NOT_NEEDED by default)
  await sql`
    ALTER TABLE "videos"
      ADD COLUMN "transcription_status" text NOT NULL DEFAULT 'NOT_NEEDED',
      ADD COLUMN "transcription_error" text,
      ADD COLUMN "transcription_status_updated_at" timestamp
  `.execute(db);

  await sql`
    UPDATE "videos" v
    SET
      "transcription_status" = CASE j.status
        WHEN 'SUCCEEDED' THEN 'SUCCEEDED'
        WHEN 'FAILED' THEN 'FAILED'
        ELSE 'PENDING'
      END,
      "transcription_status_updated_at" = j."status_updated_at"
    FROM "transcription_jobs" j WHERE j."video_id" = v.id
  `.execute(db);

  await sql`
    CREATE INDEX "videos_transcription_pending"
    ON "videos" (id)
    WHERE "transcription_status" = 'PENDING'
  `.execute(db);

  // Drop old job tables
  await sql`DROP TABLE "transcription_jobs"`.execute(db);
  await sql`DROP TABLE "video_jobs"`.execute(db);
  await sql`DROP TABLE "video_discovery_jobs"`.execute(db);
  await sql`DROP TABLE "channel_jobs"`.execute(db);
  await sql`DROP TABLE "channel_discovery_jobs"`.execute(db);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function down(db: Kysely<any>): Promise<void> {
  // Drop new columns and indexes
  await sql`DROP INDEX IF EXISTS "videos_transcription_pending"`.execute(db);
  await sql`DROP INDEX IF EXISTS "video_entries_video_process_pending"`.execute(db);
  await sql`DROP INDEX IF EXISTS "channels_video_discovery_pending"`.execute(db);
  await sql`DROP INDEX IF EXISTS "channel_entries_channel_process_pending"`.execute(db);
  await sql`DROP INDEX IF EXISTS "search_channel_queries_channel_discovery_pending"`.execute(db);

  await sql`ALTER TABLE "videos" DROP COLUMN "transcription_status", DROP COLUMN "transcription_error", DROP COLUMN "transcription_status_updated_at"`.execute(db);
  await sql`ALTER TABLE "video_entries" DROP COLUMN "video_process_status", DROP COLUMN "video_process_error", DROP COLUMN "video_process_status_updated_at"`.execute(db);
  await sql`ALTER TABLE "channels" DROP COLUMN "video_discovery_status", DROP COLUMN "video_discovery_error", DROP COLUMN "video_discovery_status_updated_at"`.execute(db);
  await sql`ALTER TABLE "channel_entries" DROP COLUMN "channel_process_status", DROP COLUMN "channel_process_error", DROP COLUMN "channel_process_status_updated_at"`.execute(db);
  await sql`ALTER TABLE "search_channel_queries" DROP COLUMN "channel_discovery_status", DROP COLUMN "channel_discovery_error", DROP COLUMN "channel_discovery_status_updated_at"`.execute(db);

  // Recreate job tables (empty — data cannot be restored)
  await sql`
    CREATE TABLE "channel_discovery_jobs" (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "search_query_id" uuid NOT NULL UNIQUE REFERENCES "search_channel_queries"(id),
      status text NOT NULL,
      "status_updated_at" timestamp,
      "created_at" timestamp NOT NULL DEFAULT now()
    )
  `.execute(db);

  await sql`
    CREATE TABLE "channel_jobs" (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "channel_id" varchar(24) NOT NULL UNIQUE REFERENCES "channel_entries"(id),
      status text NOT NULL,
      "status_updated_at" timestamp,
      "created_at" timestamp NOT NULL DEFAULT now()
    )
  `.execute(db);

  await sql`
    CREATE TABLE "video_discovery_jobs" (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "channel_id" varchar(24) NOT NULL UNIQUE REFERENCES "channels"(id),
      status text NOT NULL,
      "status_updated_at" timestamp,
      "created_at" timestamp NOT NULL DEFAULT now()
    )
  `.execute(db);

  await sql`
    CREATE TABLE "video_jobs" (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "video_id" varchar(24) NOT NULL UNIQUE REFERENCES "video_entries"(id),
      "channel_id" varchar(24) NOT NULL REFERENCES "channels"(id),
      status text NOT NULL,
      "skip_cause" text,
      "status_updated_at" timestamp,
      "created_at" timestamp NOT NULL DEFAULT now()
    )
  `.execute(db);

  await sql`
    CREATE TABLE "transcription_jobs" (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "video_id" varchar(24) NOT NULL UNIQUE REFERENCES "videos"(id),
      status text NOT NULL,
      "status_updated_at" timestamp,
      "created_at" timestamp NOT NULL DEFAULT now()
    )
  `.execute(db);
}
