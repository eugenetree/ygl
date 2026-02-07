import { injectable } from "inversify";

import { dbClient } from "../../../../db/client.js";
import { Failure, Result, Success } from "../../../../types/index.js";
import { tryCatch } from "../../../_common/try-catch.js";
import { Logger } from "../../../_common/logger/logger.js";
import { SearchChannelQuery } from "../../../domain/search-channel-query.js";
import { DatabaseError, DatabaseNothingToUpdateError } from "../../../../db/types.js";

@injectable()
export class QueriesRepository {
  constructor(private readonly logger: Logger) {
    this.logger.setContext(QueriesRepository.name);
  }

  async getNextQueryToProcess(): Promise<Result<SearchChannelQuery | null, DatabaseError>> {
    const result = await tryCatch(
      dbClient
        .selectFrom("searchChannelQueries")
        .selectAll()
        .where("processingStatus", "=", "NOT_STARTED")
        .orderBy("processingStatusUpdatedAt", "asc")
        .limit(1)
        .executeTakeFirst(),
    );

    if (!result.ok) {
      return Failure({
        type: "DATABASE",
        error: result.error,
      });
    }

    const row = result.value;

    if (!row) {
      return Success(null);
    }

    return Success(row);
  }

  async markAsFailed(id: string): Promise<Result<SearchChannelQuery, DatabaseError | DatabaseNothingToUpdateError>> {
    const updateResult = await tryCatch(
      dbClient
        .updateTable("searchChannelQueries")
        .set({
          processingStatus: "FAIL",
          processingStatusUpdatedAt: new Date(),
        })
        .where("id", "=", id)
        .returningAll()
        .executeTakeFirst(),
    );

    if (!updateResult.ok) {
      return Failure({
        type: "DATABASE",
        error: updateResult.error,
      });
    }

    if (!updateResult.value) {
      return Failure({
        type: "DATABASE_NOTHING_TO_UPDATE",
        id,
      });
    }

    return Success(updateResult.value);
  }

  async markAsSuccess(id: string): Promise<Result<SearchChannelQuery, DatabaseError | DatabaseNothingToUpdateError>> {
    const updateResult = await tryCatch(
      dbClient
        .updateTable("searchChannelQueries")
        .set({
          processingStatus: "SUCCESS",
          processingStatusUpdatedAt: new Date(),
        })
        .where("id", "=", id)
        .returningAll()
        .executeTakeFirst(),
    );

    if (!updateResult.ok) {
      return Failure({
        type: "DATABASE",
        error: updateResult.error,
      });
    }

    if (!updateResult.value) {
      return Failure({
        type: "DATABASE_NOTHING_TO_UPDATE",
        id,
      });
    }

    return Success(updateResult.value);
  }
}
