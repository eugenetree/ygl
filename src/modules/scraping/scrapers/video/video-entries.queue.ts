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

  public async getNextEntry(): Promise<Result<VideoEntryRow | null, DatabaseError>> {
    const result = await tryCatch(
      dbClient.transaction().execute(async (trx) => {
        const row = await trx
          .updateTable("videoEntries")
          .set({ videoProcessStatus: "RUNNING", videoProcessStatusUpdatedAt: new Date() })
          .where(
            "id",
            "in",
            (eb) =>
              eb.selectFrom("videoEntries")
                .select("videoEntries.id")
                .where("videoProcessStatus", "=", "PENDING")
                // TODO: temporary skip as this channel contains too many members only videos
                .where("videoEntries.channelId", "!=", "UCPHpx55tgrbm8FrYYCflAHw")
                .where((eb) =>
                  eb.not(
                    eb.exists(
                      eb.selectFrom("channelVideosHealth")
                        .select("id")
                        .whereRef("channelVideosHealth.channelId", "=", "videoEntries.channelId")
                        .where("failedVideosStreak", ">=", MAX_FAILED_VIDEOS_STREAK)
                    )
                  )
                )
                .orderBy(sql`random()`)
                .limit(1)
                .forUpdate()
                .skipLocked(),
          )
          .returningAll()
          .executeTakeFirst();

        return row ?? null;
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
        .updateTable("videoEntries")
        .set({ videoProcessStatus: "SUCCEEDED", videoProcessError: null, videoProcessStatusUpdatedAt: new Date() })
        .where("id", "=", entryId)
        .execute()
    );

    if (!result.ok) {
      return Failure({ type: "DATABASE", error: result.error });
    }

    return Success(undefined);
  }

  public async markAsFailed(entryId: string, error?: string): Promise<Result<void, DatabaseError>> {
    const result = await tryCatch(
      dbClient
        .updateTable("videoEntries")
        .set({ videoProcessStatus: "FAILED", videoProcessError: error ?? null, videoProcessStatusUpdatedAt: new Date() })
        .where("id", "=", entryId)
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
        .updateTable("videoEntries")
        .set({ videoProcessStatus: "SKIPPED", videoProcessError: cause, videoProcessStatusUpdatedAt: new Date() })
        .where("id", "=", entryId)
        .execute()
    );

    if (!result.ok) {
      return Failure({ type: "DATABASE", error: result.error });
    }

    return Success(undefined);
  }
}
