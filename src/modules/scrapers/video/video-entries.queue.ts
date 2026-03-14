import { dbClient } from "../../../db/client.js";
import { Logger } from "../../_common/logger/logger.js";
import { tryCatch } from "../../_common/try-catch.js";
import { DatabaseError, VideoEntryRow } from "../../../db/types.js";
import { Failure, Result, Success } from "../../../types/index.js";
import { injectable } from "inversify";
import { MAX_FAILED_VIDEOS_STREAK } from "./config.js";

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
                .leftJoin("channelVideosHealth", "channelVideosHealth.channelId", "videoJobs.channelId")
                .select("videoJobs.id")
                .where("status", "=", "PENDING")
                .where((eb) =>
                  eb.or([
                    eb("channelVideosHealth.failedVideosStreak", "is", null),
                    eb("channelVideosHealth.failedVideosStreak", "<", MAX_FAILED_VIDEOS_STREAK),
                  ])
                )
                .limit(1)
                .forUpdate()
                .skipLocked()
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
}
