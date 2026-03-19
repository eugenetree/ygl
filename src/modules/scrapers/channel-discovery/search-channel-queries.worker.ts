import { injectable } from "inversify";
import { Logger } from "../../_common/logger/logger.js";
import { FindChannelsUseCase } from "./use-cases/find-channels.use-case.js";
import { SearchChannelQueriesQueue } from "./search-channel-queries.queue.js";

@injectable()
export class SearchChannelQueriesWorker {
  private isRunning: boolean = false;

  constructor(
    private readonly logger: Logger,
    private readonly findChannels: FindChannelsUseCase,
    private readonly searchChannelQueriesQueue: SearchChannelQueriesQueue,
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
        this.logger.error({ error: queryResult.error });
        this.isRunning = false;
        return;
      }

      const query = queryResult.value;

      if (!query) {
        this.logger.info("Search queries queue is empty. Waiting...");
        await new Promise((resolve) => setTimeout(resolve, 1000 * 60));
        continue;
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
        continue;
      }

      await this.searchChannelQueriesQueue.markAsSuccess(query.id);

      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  }
}
