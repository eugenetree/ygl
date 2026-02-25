import { injectable } from "inversify";

import { dbClient } from "../../../db/client.js";
import { Failure, Result, Success } from "../../../types/index.js";
import { tryCatch } from "../../_common/try-catch.js";
import { Logger } from "../../_common/logger/logger.js";
import { SearchChannelViaVideosQuery } from "../../domain/search-channel-via-videos-query.js";
import { DatabaseError } from "../../../db/types.js";

@injectable()
export class SearchChannelViaVideosQueriesRepository {
  constructor(private readonly logger: Logger) {
    this.logger.setContext(SearchChannelViaVideosQueriesRepository.name);
  }

  async getNextQueryToProcess(): Promise<Result<SearchChannelViaVideosQuery | null, DatabaseError>> {
    const result = await tryCatch(
      dbClient
        .selectFrom("searchChannelViaVideosQueries")
        .selectAll()
        .where("processingStatus", "=", "PENDING")
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

  async markAsFailed(query: SearchChannelViaVideosQuery): Promise<Result<void, DatabaseError>> {
    const result = await tryCatch(
      dbClient
        .updateTable("searchChannelViaVideosQueries")
        .set({
          processingStatus: "FAILED",
          processingStatusUpdatedAt: new Date(),
        })
        .where("query", "=", query.query)
        .execute(),
    );

    if (!result.ok) {
      return Failure({
        type: "DATABASE",
        error: result.error,
      });
    }

    return Success(undefined);
  }

  async markAsSuccess(query: SearchChannelViaVideosQuery): Promise<Result<void, DatabaseError>> {
    const result = await tryCatch(
      dbClient
        .updateTable("searchChannelViaVideosQueries")
        .set({
          processingStatus: "SUCCEEDED",
          processingStatusUpdatedAt: new Date(),
        })
        .where("query", "=", query.query)
        .execute(),
    );

    if (!result.ok) {
      return Failure({
        type: "DATABASE",
        error: result.error,
      });
    }

    return Success(undefined);
  }
}
