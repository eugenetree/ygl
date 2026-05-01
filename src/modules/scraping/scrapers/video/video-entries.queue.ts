import { tryCatch } from "../../../_common/try-catch.js";
import { DatabaseError, VideoEntryRow, VideoJobSkipCause } from "../../../../db/types.js";
import { Failure, Result, Success } from "../../../../types/index.js";
import { injectable } from "inversify";
import { sql } from "kysely";
import { DatabaseClient } from "../../../../db/client.js";

@injectable()
export class VideoEntriesQueue {
  constructor(private readonly db: DatabaseClient) { }

  public async enqueue(videoId: string, channelId: string): Promise<Result<void, DatabaseError>> {
    const result = await tryCatch(
      this.db
        .insertInto("videoJobs")
        .values({ videoId, channelId, status: "PENDING", statusUpdatedAt: new Date() })
        .execute(),
    );

    if (!result.ok) {
      return Failure({ type: "DATABASE", error: result.error });
    }

    return Success(undefined);
  }

  public async getNextEntry(): Promise<Result<VideoEntryRow | null, DatabaseError>> {
    const result = await tryCatch(
      this.db.transaction().execute(async (trx) => {
        const job = await trx
          .updateTable("videoJobs")
          .set({ status: "PROCESSING", statusUpdatedAt: new Date() })
          .where(
            "id",
            "in",
            (eb) =>
              eb.selectFrom("videoJobs")
                .leftJoin("channelProcessingStats", "channelProcessingStats.channelId", "videoJobs.channelId")
                .select("videoJobs.id")
                .where("status", "=", "PENDING")
                // TODO: temporary skip as this channel contains too many members only videos.
                // need check if yt-dlp supports option to skip members only videos during the discovery phase
                .where("videoJobs.channelId", "!=", "UCPHpx55tgrbm8FrYYCflAHw")
                .orderBy(
                  sql<number>`CASE
                    WHEN "channel_processing_stats"."total_processed_count" >= 100
                      AND "channel_processing_stats"."valid_captions_count"::float / "channel_processing_stats"."total_processed_count" >= 0.1
                    THEN 0
                    WHEN "channel_processing_stats"."total_processed_count" IS NULL
                      OR "channel_processing_stats"."total_processed_count" < 100
                    THEN 1
                    ELSE 2
                  END`,
                  "asc"
                )
                .limit(1)
                .forUpdate(["videoJobs"])
                .skipLocked(),
          )
          .returning(["videoId", "channelId"])
          .executeTakeFirst();

        if (!job) return null;
        return trx
          .selectFrom("videoEntries")
          .selectAll()
          .where("id", "=", job.videoId)
          .executeTakeFirst();
      })
    );

    if (!result.ok) {
      return Failure({ type: "DATABASE", error: result.error });
    }

    return Success(result.value ?? null);
  }

  public async markAsSuccess(entryId: string): Promise<Result<void, DatabaseError>> {
    const result = await tryCatch(
      this.db
        .updateTable("videoJobs")
        .set({ status: "SUCCEEDED", statusUpdatedAt: new Date() })
        .where("videoId", "=", entryId)
        .execute()
    );

    if (!result.ok) {
      return Failure({ type: "DATABASE", error: result.error });
    }

    return Success(undefined);
  }

  public async markAsFailed(entryId: string): Promise<Result<void, DatabaseError>> {
    const result = await tryCatch(
      this.db
        .updateTable("videoJobs")
        .set({ status: "FAILED", statusUpdatedAt: new Date() })
        .where("videoId", "=", entryId)
        .execute()
    );

    if (!result.ok) {
      return Failure({ type: "DATABASE", error: result.error });
    }

    return Success(undefined);
  }

  public async markAsSkipped(entryId: string, cause: VideoJobSkipCause): Promise<Result<void, DatabaseError>> {
    const result = await tryCatch(
      this.db
        .updateTable("videoJobs")
        .set({ status: "SKIPPED", skipCause: cause, statusUpdatedAt: new Date() })
        .where("videoId", "=", entryId)
        .execute()
    );

    if (!result.ok) {
      return Failure({ type: "DATABASE", error: result.error });
    }

    return Success(undefined);
  }
}
