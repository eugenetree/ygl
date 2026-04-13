import { randomUUID } from "crypto";
import { DatabaseError, UpdateableElasticCaptionsSyncRow } from "../../db/types.js";
import { ElasticCaptionsSync, ElasticCaptionsSyncProps } from "./elastic-captions-sync.js";
import { Failure, Result, Success } from "../../types/index.js";
import { tryCatch } from "../_common/try-catch.js";
import { dbClient } from "../../db/client.js";
import { injectable } from "inversify";

@injectable()
export class ElasticCaptionsSyncRepository {
  async create(values: ElasticCaptionsSyncProps): Promise<Result<string, DatabaseError>> {
    const id = randomUUID();
    const result = await tryCatch(
      dbClient.insertInto("elasticCaptionsSync")
        .values({ ...values, id })
        .execute(),
    );

    if (!result.ok) {
      return Failure({ type: "DATABASE", error: result.error });
    }

    return Success(id);
  }

  async update(id: string, values: UpdateableElasticCaptionsSyncRow): Promise<Result<void, DatabaseError>> {
    const result = await tryCatch(
      dbClient.updateTable("elasticCaptionsSync")
        .set(values)
        .where("id", "=", id)
        .execute(),
    );

    if (!result.ok) {
      return Failure({ type: "DATABASE", error: result.error });
    }

    return Success(undefined);
  }

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

    const result = await tryCatch(
      dbClient.selectFrom("captions")
        .selectAll()
        .where("type", "=", "manual")
        .where("createdAt", ">", (qb) =>
          qb.selectFrom("captions").select("createdAt").where("id", "=", lastSyncedCaptionId)
        )
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