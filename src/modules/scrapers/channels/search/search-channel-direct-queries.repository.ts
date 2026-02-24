import { injectable } from "inversify";

import { dbClient } from "../../../../db/client.js";
import { Failure, Result, Success } from "../../../../types/index.js";
import { tryCatch } from "../../../_common/try-catch.js";
import { Logger } from "../../../_common/logger/logger.js";
import { SearchChannelDirectQuery } from "../../../domain/search-channel-direct-query.js";
import { DatabaseError } from "../../../../db/types.js";

@injectable()
export class SearchChannelDirectQueriesRepository {
  constructor(private readonly logger: Logger) {
    this.logger.setContext(SearchChannelDirectQueriesRepository.name);
  }

  async getNextQueryToProcess({
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    rescrapeDelay,
  }: {
    rescrapeDelay: number;
  }): Promise<Result<SearchChannelDirectQuery | null, DatabaseError>> {
    const result = await tryCatch(
      dbClient
        .selectFrom("searchChannelDirectQueries")
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

    const row = result.value as unknown as SearchChannelDirectQuery | undefined;

    if (!row) {
      return Success(null);
    }

    return Success(row);
  }

  async markAsFailed(query: SearchChannelDirectQuery): Promise<Result<void, DatabaseError>> {
    const result = await tryCatch(
      dbClient
        .updateTable("searchChannelDirectQueries")
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

  async markAsSuccess(query: SearchChannelDirectQuery): Promise<Result<void, DatabaseError>> {
    const result = await tryCatch(
      dbClient
        .updateTable("searchChannelDirectQueries")
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
