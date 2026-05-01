import { randomUUID } from "crypto";
import { DatabaseError, UpdateableElasticCaptionsSyncRow } from "../../db/types.js";
import { ElasticCaptionsSync, ElasticCaptionsSyncProps } from "./elastic-captions-sync.js";
import { Failure, Result, Success } from "../../types/index.js";
import { tryCatch } from "../_common/try-catch.js";
import { DatabaseClient } from "../../db/client.js";
import { injectable } from "inversify";

@injectable()
export class ElasticCaptionsSyncRepository {
  constructor(private readonly db: DatabaseClient) {}

  async create(values: ElasticCaptionsSyncProps): Promise<Result<string, DatabaseError>> {
    const id = randomUUID();
    const result = await tryCatch(
      this.db.insertInto("elasticCaptionsSync")
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
      this.db.updateTable("elasticCaptionsSync")
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
      this.db.selectFrom("elasticCaptionsSync")
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
    let query = this.db.selectFrom("captions")
      .innerJoin("videos", "videos.id", "captions.videoId")
      .where("captions.type", "=", "manual")
      .where("videos.manualCaptionsStatus", "=", "CAPTIONS_VALID")
      .where("videos.autoCaptionsStatus", "=", "CAPTIONS_VALID")
      .where("videos.captionsSimilarityScore", ">=", 0.9)
      .selectAll("captions")
      .orderBy("captions.createdAt", "asc");

    if (lastSyncedCaptionId) {
      query = query.where("captions.createdAt", ">", (qb) =>
        qb.selectFrom("captions").select("createdAt").where("id", "=", lastSyncedCaptionId)
      );
    }

    const result = await tryCatch(query.execute());

    if (!result.ok) {
      return Failure({
        type: "DATABASE",
        error: result.error,
      });
    }

    return Success(result.value);
  }
}
