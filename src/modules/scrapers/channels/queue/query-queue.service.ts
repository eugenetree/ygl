import { Failure, Result, Success } from "../../../../types/index.js";
import { Logger } from "../../../_common/logger/logger.js";
import { SearchChannelQuery } from "../../../domain/search-channel-query.js";
import { QueriesRepository } from "./queries.repository.js";

type QueryUpdateError = {
  type: "QUERY_UPDATE_FAILED",
}

export class QueryQueueService {
  constructor(private readonly queriesRepository: QueriesRepository, private readonly logger: Logger) {
    this.logger.setContext(QueryQueueService.name);
  }

  public async getNextQueryToProcess(): Promise<Result<SearchChannelQuery | null, void>> {
    const result = await this.queriesRepository.getNextQueryToProcess();

    if (!result.ok) {
      this.logger.error({
        message: "Failed to get next query to process",
        error: result.error.error,
      });

      return Success(null);
    }

    return Success(result.value);
  } 

  public async markAsFailed(id: string): Promise<Result<SearchChannelQuery, QueryUpdateError>> {
    const markAsFailedResult = await this.queriesRepository.markAsFailed(id);

    if (!markAsFailedResult.ok) {
      this.logger.error({
        message: "Failed to mark query as failed",
        context: { id, error: markAsFailedResult.error },
      });

      return Failure({
        type: "QUERY_UPDATE_FAILED",
        error: markAsFailedResult.error,
      });
    }

    return Success(markAsFailedResult.value);
  }

  public async markAsSuccess(id: string): Promise<Result<SearchChannelQuery, QueryUpdateError>> {
    const markAsSuccessResult = await this.queriesRepository.markAsSuccess(id);

    if (!markAsSuccessResult.ok) {
      this.logger.error({
        message: "Failed to mark query as success",
        context: { id, error: markAsSuccessResult.error },
      });

      return Failure({
        type: "QUERY_UPDATE_FAILED",
        error: markAsSuccessResult.error,
      });
    }

    return Success(markAsSuccessResult.value);
  }
}