import { injectable } from "inversify";
import { Logger } from "../../_common/logger/logger.js";
import { SearchChannelQueriesQueue } from "./search-channel-queries.queue.js";
import { SearchChannelQueriesProcessor } from "./search-channel-queries.processor.js";

@injectable()
export class SearchChannelQueriesWorker {
  private isRunning: boolean = false;

  constructor(
    private readonly logger: Logger,
    private readonly searchChannelQueriesQueue: SearchChannelQueriesQueue,
    private readonly searchChannelQueriesProcessor: SearchChannelQueriesProcessor,
  ) { }

  public async start() {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;

    while (this.isRunning) {
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
        this.logger.info("No queries found. Waiting.");
        await new Promise((resolve) => setTimeout(resolve, 1000 * 60));
        continue;
      }

      await new Promise((resolve) => setTimeout(resolve, 5000));

      this.logger.info(`Processing query ${query.id} started`);
      const processResult = await this.searchChannelQueriesProcessor.process(query);

      if (!processResult.ok) {
        this.logger.error({
          message: `Processing query ${query.id} failed`,
          error: processResult.error,
          context: { queryId: query.id },
        });

        await this.searchChannelQueriesQueue.markAsFailed(query.id);
        this.isRunning = false;
        return;
      }

      this.logger.info(`Processing query ${query.id} finished`);
      const markAsSuccessResult = await this.searchChannelQueriesQueue.markAsSuccess(query.id);

      if (!markAsSuccessResult.ok) {
        this.logger.error({
          message: `Marking query ${query.id} as success failed`,
          error: markAsSuccessResult.error,
          context: { queryId: query.id },
        });

        await this.searchChannelQueriesQueue.markAsFailed(query.id);
        this.isRunning = false;
        return;
      }
    }
  }
}