import { injectable } from "inversify";

import { dbClient } from "../../../../db/client.js";
import { Failure, Result, Success } from "../../../../types/index.js";
import { tryCatch } from "../../../_common/try-catch.js";
import { Logger } from "../../../_common/logger/logger.js";
import { SearchChannelQuery } from "../../../domain/search-channel-query.js";
import { DatabaseError } from "../../../../db/types.js";

@injectable()
export class SearchChannelQueriesRepository {
  constructor(private readonly logger: Logger) {
    this.logger.setContext(SearchChannelQueriesRepository.name);
  }

  async getNextQueryToProcess({
    rescrapeDelay,
  }: {
    rescrapeDelay: number;
  }): Promise<Result<SearchChannelQuery | null, DatabaseError>> {
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

    const row = result.value as unknown as SearchChannelQuery | undefined;

    if (!row) {
      return Success(null);
    }

    return Success(row);
  }

  async markAsFailed(query: SearchChannelQuery): Promise<Result<void, DatabaseError>> {
    const result = await tryCatch(
      dbClient
        .updateTable("searchChannelQueries")
        .set({
          processingStatus: "FAIL",
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

  async markAsSuccess(query: SearchChannelQuery): Promise<Result<void, DatabaseError>> {
    const result = await tryCatch(
      dbClient
        .updateTable("searchChannelQueries")
        .set({
          processingStatus: "SUCCESS",
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
