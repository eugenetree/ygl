import { randomUUID } from "crypto";
import { injectable } from "inversify";
import type { ExpressionBuilder } from "kysely";
import { DatabaseClient } from "../../db/client.js";
import {
  type CaptionRow,
  type Database,
  DatabaseError,
  UpdateableElasticCaptionsSyncRow,
} from "../../db/types.js";
import { Failure, type Result, Success } from "../../types/index.js";
import { tryCatch } from "../_common/try-catch.js";
import {
  ElasticCaptionsSync,
  ElasticCaptionsSyncProps,
} from "./elastic-captions-sync.js";

export type CaptionToIndex = Pick<
  CaptionRow,
  "id" | "videoId" | "startTime" | "endTime" | "text"
> & { channelId: string };

const CAPTION_TO_INDEX_COLUMNS = [
  "captions.id",
  "captions.videoId",
  "captions.startTime",
  "captions.endTime",
  "captions.text",
  "videos.channelId",
] as const;

function isSearchable(eb: ExpressionBuilder<Database, "videos">) {
  return eb.and([
    eb("videos.manualCaptionsStatus", "=", "CAPTIONS_VALID"),
    eb("videos.autoCaptionsStatus", "=", "CAPTIONS_VALID"),
    eb("videos.captionsSimilarityScore", ">=", 0.9),
  ]);
}

@injectable()
export class ElasticCaptionsSyncRepository {
  constructor(private readonly db: DatabaseClient) {}

  async create(
    values: ElasticCaptionsSyncProps,
  ): Promise<Result<string, DatabaseError>> {
    const id = randomUUID();
    const result = await tryCatch(
      this.db
        .insertInto("elasticCaptionsSync")
        .values({ ...values, id })
        .execute(),
    );

    if (!result.ok) {
      return Failure({ type: "DATABASE", error: result.error });
    }

    return Success(id);
  }

  async update(
    id: string,
    values: UpdateableElasticCaptionsSyncRow,
  ): Promise<Result<void, DatabaseError>> {
    const result = await tryCatch(
      this.db
        .updateTable("elasticCaptionsSync")
        .set(values)
        .where("id", "=", id)
        .execute(),
    );

    if (!result.ok) {
      return Failure({ type: "DATABASE", error: result.error });
    }

    return Success(undefined);
  }

  async getLastSuccessfulSync(): Promise<
    Result<ElasticCaptionsSync | null, DatabaseError>
  > {
    const result = await tryCatch(
      this.db
        .selectFrom("elasticCaptionsSync")
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
    let query = this.db
      .selectFrom("captions")
      .innerJoin("videos", "videos.id", "captions.videoId")
      .where("captions.type", "=", "manual")
      .where(isSearchable)
      .select(CAPTION_TO_INDEX_COLUMNS)
      .orderBy("captions.createdAt", "asc");

    if (lastSyncedCaptionId) {
      query = query.where("captions.createdAt", ">", (qb) =>
        qb
          .selectFrom("captions")
          .select("createdAt")
          .where("id", "=", lastSyncedCaptionId),
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

  async newestCaptionId(): Promise<Result<string | null, DatabaseError>> {
    const result = await tryCatch(
      this.db
        .selectFrom("captions")
        .select("id")
        .orderBy("createdAt", "desc")
        .limit(1)
        .executeTakeFirst(),
    );

    if (!result.ok) {
      return Failure({ type: "DATABASE", error: result.error });
    }

    return Success(result.value?.id ?? null);
  }

  /** A page of searchable videos' ids, in id order, after `afterId`. */
  async searchableVideoIds(
    afterId: string | null,
    limit: number,
  ): Promise<Result<string[], DatabaseError>> {
    let query = this.db
      .selectFrom("videos")
      .select("videos.id")
      .where(isSearchable)
      .orderBy("videos.id", "asc")
      .limit(limit);

    if (afterId !== null) {
      query = query.where("videos.id", ">", afterId);
    }

    const result = await tryCatch(query.execute());

    if (!result.ok) {
      return Failure({ type: "DATABASE", error: result.error });
    }

    return Success(result.value.map(({ id }) => id));
  }

  async manualCaptionsOfVideo(
    videoId: string,
  ): Promise<Result<CaptionToIndex[], DatabaseError>> {
    const result = await tryCatch(
      this.db
        .selectFrom("captions")
        .innerJoin("videos", "videos.id", "captions.videoId")
        .where("captions.videoId", "=", videoId)
        .where("captions.type", "=", "manual")
        .select(CAPTION_TO_INDEX_COLUMNS)
        .execute(),
    );

    if (!result.ok) {
      return Failure({ type: "DATABASE", error: result.error });
    }

    return Success(result.value);
  }
}
