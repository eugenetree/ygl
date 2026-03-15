import { injectable } from "inversify";
import { Logger } from "../../_common/logger/logger.js";
import { SearchChannelQueriesQueue } from "./search-channel-queries.queue.js";
import { FindChannelsUseCase } from "./use-cases/find-channels.use-case.js";

@injectable()
export class SearchChannelQueriesWorker {
  private isRunning: boolean = false;

  constructor(
    private readonly logger: Logger,
    private readonly searchChannelQueriesQueue: SearchChannelQueriesQueue,
    private readonly processSearchQuery: FindChannelsUseCase,
  ) { }

  public async start(shouldContinue: () => boolean = () => true) {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;

    while (this.isRunning) {
      if (!shouldContinue()) {
        this.logger.info("shouldContinue() returned false. Stopping worker.");
        this.isRunning = false;
        return;
      }

      const queryResult = await this.searchChannelQueriesQueue.getNextQuery();
      if (!queryResult.ok) {
        this.logger.error({
          error: queryResult.error,
        });

        this.isRunning = false;
        return;
      }

      const query = queryResult.value;
      if (!query) {
        this.logger.info("Search queries queue is empty. Waiting...");
        await new Promise((resolve) => setTimeout(resolve, 1000 * 60));
        continue;
      }

      await new Promise((resolve) => setTimeout(resolve, 5000));
      this.logger.info(`Processing search query ${query.id}...`);

      const processResult = await this.processSearchQuery.execute({
        queryId: query.id,
        queryText: query.query,
      });

      if (!processResult.ok) {
        this.logger.error({
          message: `Processing search query ${query.id} failed`,
          error: processResult.error,
          context: { queryId: query.id },
        });

        const markAsFailedResult = await this.searchChannelQueriesQueue.markAsFailed(query.id);
        if (!markAsFailedResult.ok) {
          this.logger.error({
            message: `Marking search query ${query.id} as failed failed`,
            error: markAsFailedResult.error,
            context: { queryId: query.id },
          });

          this.isRunning = false;
          return;
        }

        continue;
      }

      this.logger.info(`Processing search query ${query.id} finished`);

      const markAsSuccessResult = await this.searchChannelQueriesQueue.markAsSuccess(query.id);
      if (!markAsSuccessResult.ok) {
        this.logger.error({
          message: `Marking search query ${query.id} as success failed`,
          error: markAsSuccessResult.error,
          context: { queryId: query.id },
        });

        this.isRunning = false;
        return;
      }
    }
  }
}