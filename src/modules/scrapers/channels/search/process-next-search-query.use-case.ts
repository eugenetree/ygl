import { injectable } from "inversify";
import { Failure, Result, Success } from "../../../../types/index.js";
import { Logger } from "../../../_common/logger/logger.js";
import {
  DELAY_WHEN_FAILED_TO_GET_NEXT_QUERY,
  DELAY_WHEN_FAILED_TO_PROCESS_QUERY,
  DELAY_WHEN_NO_QUERY,
  RESCRAPE_QUERY_DELAY,
} from "./constants.js";
import { SearchChannelQueriesRepository } from "./search-channel-queries.repository.js";
import { ChannelDiscoveryService } from "./channel-discovery.service.js";
import { BaseError } from "../../../_common/errors.js";

@injectable()
export class ProcessNextSearchQueryUseCase {
  constructor(
    private readonly queriesRepository: SearchChannelQueriesRepository,
    private readonly channelDiscoveryService: ChannelDiscoveryService,
    private readonly logger: Logger,
  ) {
    this.logger.setContext(ProcessNextSearchQueryUseCase.name);
  }

  async execute(): Promise<Result<null, { waitFor: number; error: BaseError }>> {
    const query = await this.queriesRepository.getNextQueryToProcess({
      rescrapeDelay: RESCRAPE_QUERY_DELAY,
    });

    if (!query.ok) {
      this.logger.error({
        message: `Failed to get next query to process. Waiting for ${DELAY_WHEN_FAILED_TO_GET_NEXT_QUERY}ms.`,
        error: query.error,
      });

      return Failure({
        waitFor: DELAY_WHEN_FAILED_TO_GET_NEXT_QUERY,
        error: query.error,
      });
    }

    if (!query.value) {
      this.logger.info(
        `No query to process. Waiting for ${DELAY_WHEN_NO_QUERY}ms.`,
      );

      return Failure({
        waitFor: DELAY_WHEN_NO_QUERY,
        error: {
          type: "NO_QUERY_TO_PROCESS",
        },
      });
    }

    const processResult = await this.channelDiscoveryService.discoverByQuery(query.value.query);

    if (!processResult.ok) {
      const markAsFailedResult = await this.queriesRepository.markAsFailed(
        query.value,
      );

      if (!markAsFailedResult.ok) {
        this.logger.error({
          message: `Failed to mark query as failed.`,
          error: markAsFailedResult.error,
          context: { query },
        });

        return Failure({
          waitFor: DELAY_WHEN_FAILED_TO_PROCESS_QUERY,
          error: markAsFailedResult.error,
        });
      }

      return Failure({
        waitFor: DELAY_WHEN_FAILED_TO_PROCESS_QUERY,
        error: processResult.error,
      });
    }

    const markAsSuccessResult = await this.queriesRepository.markAsSuccess(
      query.value,
    );

    if (!markAsSuccessResult.ok) {
      this.logger.error({
        message: `Failed to mark query as success.`,
        error: markAsSuccessResult.error,
      });

      return Failure({
        waitFor: DELAY_WHEN_FAILED_TO_PROCESS_QUERY,
        error: markAsSuccessResult.error,
      });
    }

    return Success(null);
  }
}



