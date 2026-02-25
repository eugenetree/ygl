import { DatabaseError } from "../../db/types.js";
import { ElasticCaptionsSync } from "../domain/elastic-captions-sync.js";
import { Failure, Result, Success } from "../../types/index.js";
import { tryCatch } from "../_common/try-catch.js";
import { dbClient } from "../../db/client.js";
import { injectable } from "inversify";

@injectable()
export class ElasticCaptionsSyncRepository {
  async getLastSuccessfulSync(): Promise<Result<ElasticCaptionsSync | null, DatabaseError>> {
    const result = await tryCatch(
      dbClient.selectFrom("elasticCaptionsSync")
        .selectAll()
        .where("syncStatus", "=", "SUCCESS")
        .orderBy("syncCompletedAt", "desc")
        .limit(1)
        .executeTakeFirst(),
    );

    if (!result.ok) {
      return Failure({
        type: "DATABASE",
        error: result.error,
      });
    }

    return Success(result.value ?? null);
  }

  async getDataToSync(lastSyncedCaptionId?: string) {
    console.log("Getting data to sync", lastSyncedCaptionId);
    if (!lastSyncedCaptionId) {
      const result = await tryCatch(
        dbClient.selectFrom("captions")
          .selectAll()
          .where("type", "=", "manual")
          .orderBy("createdAt", "asc")
          .execute(),
      );

      if (!result.ok) {
        return Failure({
          type: "DATABASE",
          error: result.error,
        });
      }

      return Success(result.value);
    }

    const lastCaptionResult = await tryCatch(
      dbClient.selectFrom("captions")
        .selectAll()
        .where("id", "=", lastSyncedCaptionId)
        .orderBy("createdAt", "desc")
        .executeTakeFirst(),
    );

    if (!lastCaptionResult.ok) {
      return Failure({
        type: "DATABASE",
        error: lastCaptionResult.error,
      });
    }

    console.log("Last caption", lastCaptionResult.value);

    const lastCaption = lastCaptionResult.value;
    if (!lastCaption) {
      throw new Error("Should not happen");
    }

    const result = await tryCatch(
      dbClient.selectFrom("captions")
        .selectAll()
        .where("createdAt", ">", lastCaption.createdAt)
        .where("type", "=", "manual")
        .orderBy("createdAt", "asc")
        .execute(),
    );

    if (!result.ok) {
      return Failure({
        type: "DATABASE",
        error: result.error,
      });
    }

    return Success(result.value);
  }
}