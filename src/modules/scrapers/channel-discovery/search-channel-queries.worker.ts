import { injectable } from "inversify";
import { Result, Success, Failure } from "../../../types/index.js";
import { BaseError } from "../../_common/errors.js";
import { Logger } from "../../_common/logger/logger.js";
import { WORKER_STOP_CAUSE, WorkerStopCause } from "../constants.js";
import { FindChannelsUseCase } from "./use-cases/find-channels.use-case.js";
import { SearchChannelQueriesQueue } from "./search-channel-queries.queue.js";

type WorkerOptions = {
  shouldContinue: () => boolean;
  onError: (error: BaseError) => Promise<{ shouldContinue: boolean }>;
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
      return Success(WORKER_STOP_CAUSE.DONE);
    }

    this.isRunning = true;

    while (this.isRunning) {
      if (!shouldContinue()) {
        this.logger.info("shouldContinue() returned false. Stopping worker.");
        this.isRunning = false;
        return Success(WORKER_STOP_CAUSE.DONE);
      }

      const queryResult = await this.searchChannelQueriesQueue.getNextQuery();

      if (!queryResult.ok) {
        this.logger.error({ error: queryResult.error });
        this.isRunning = false;
        await onError(queryResult.error);
        return Failure(queryResult.error);
      }

      const query = queryResult.value;

      if (!query) {
        this.logger.info("Search queries queue is empty.");
        this.isRunning = false;
        return Success(WORKER_STOP_CAUSE.EMPTY);
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

        const { shouldContinue: canContinue } = await onError(result.error);
        if (!canContinue) {
          this.isRunning = false;
          return Failure(result.error);
        }

        continue;
      }

      await this.searchChannelQueriesQueue.markAsSuccess(query.id);

      await new Promise((resolve) => setTimeout(resolve, 5000));
    }

    return Success(WORKER_STOP_CAUSE.DONE);
  }
}
