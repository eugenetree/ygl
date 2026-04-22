import { dbClient } from "../../../../db/client.js";
import { Logger } from "../../../_common/logger/logger.js";
import { tryCatch } from "../../../_common/try-catch.js";
import { DatabaseError, VideoEntryRow, VideoJobSkipCause } from "../../../../db/types.js";
import { Failure, Result, Success } from "../../../../types/index.js";
import { injectable } from "inversify";
import { MAX_FAILED_VIDEOS_STREAK } from "./config.js";
import { sql } from "kysely";

@injectable()
export class VideoEntriesQueue {
  constructor(private readonly logger: Logger) { }

  public async enqueue(videoId: string, channelId: string): Promise<Result<void, DatabaseError>> {
    const result = await tryCatch(
      dbClient
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
      dbClient.transaction().execute(async (trx) => {
        const job = await trx
          .updateTable("videoJobs")
          .set({ status: "PROCESSING", statusUpdatedAt: new Date() })
          .where(
            "id",
            "in",
            (eb) =>
              eb.selectFrom("videoJobs")
                .select("videoJobs.id")
                .where("status", "=", "PENDING")
                // TODO: temporary skip as this channel contains too many members only videos.
                // need check if yt-dlp supports option to skip members only videos during the discovery phase
                .where("videoJobs.channelId", "!=", "UCPHpx55tgrbm8FrYYCflAHw")
                .where((eb) =>
                  eb.not(
                    eb.exists(
                      eb.selectFrom("channelVideosHealth")
                        .select("id")
                        .whereRef("channelVideosHealth.channelId", "=", "videoJobs.channelId")
                        .where("failedVideosStreak", ">=", MAX_FAILED_VIDEOS_STREAK)
                    )
                  )
                )
                // temporary things to discover more scenarios
                .orderBy(sql`random()`)
                .limit(1)
                .forUpdate()
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
      dbClient
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
      dbClient
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
      dbClient
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
