import { injectable } from "inversify";
import { Failure, Result, Success } from "../../../../types/index.js";
import { BaseError } from "../../../_common/errors.js";
import { Logger } from "../../../_common/logger/logger.js";
import { WorkerStopCause } from "../../constants.js";
import { FindChannelsUseCase } from "./use-cases/find-channels.use-case.js";
import { SearchChannelQueriesQueue } from "./search-channel-queries.queue.js";

type WorkerOptions = {
  shouldContinue: () => boolean;
  onError: (error: BaseError) => Promise<void>;
};

@injectable()
export class SearchChannelQueriesWorker {
  private isRunning: boolean = false;

  constructor(
    logger: Logger,
    private readonly findChannels: FindChannelsUseCase,
    private readonly searchChannelQueriesQueue: SearchChannelQueriesQueue,
  ) {
    this.logger = logger.child({ context: "SearchChannelQueriesWorker", category: "worker-channels-discovery" });
  }

  private readonly logger: Logger;

  public async run({
    shouldContinue,
    onError,
  }: WorkerOptions): Promise<Result<WorkerStopCause, BaseError>> {
    if (this.isRunning) {
      return Failure({ type: "WORKER_ALREADY_RUNNING" });
    }

    this.isRunning = true;

    while (this.isRunning) {
      if (!shouldContinue()) {
        this.logger.info("shouldContinue() returned false. Stopping worker.");
        this.isRunning = false;
        return Success(WorkerStopCause.STOPPED);
      }

      const queryResult = await this.searchChannelQueriesQueue.getNextQuery();

      if (!queryResult.ok) {
        this.logger.error({ error: queryResult.error });
        this.isRunning = false;
        await onError(queryResult.error);
        return queryResult;
      }

      const query = queryResult.value;

      if (!query) {
        this.logger.info("Search queries queue is empty.");
        this.isRunning = false;
        return Success(WorkerStopCause.EMPTY);
      }

      const result = await this.findChannels.execute({
        queryId: query.id,
        queryText: query.query,
      });

      if (!result.ok) {
        this.logger.error({
          message: `Processing search query ${query.id} failed`,
          error: result.error,
          context: { queryId: query.id },
        });
        await this.searchChannelQueriesQueue.markAsFailed(query.id);
        this.isRunning = false;
        await onError(result.error);
        return result;
      }

      await this.searchChannelQueriesQueue.markAsSuccess(query.id);

      await new Promise((resolve) => setTimeout(resolve, 5000));
    }

    return Success(WorkerStopCause.DONE);
  }
}
