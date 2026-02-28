import { injectable } from "inversify";
import { Logger } from "../../_common/logger/logger.js";
import { Queue } from "./queue.js";
import { QueryProcessor } from "./query-processor.js";

@injectable()
export class SearchQueriesWorker {
  private isRunning: boolean = false;

  constructor(
    private readonly logger: Logger,
    private readonly queue: Queue,
    private readonly queryProcessor: QueryProcessor,
  ) { }

  public async start() {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;

    while (this.isRunning) {
      const queryResult = await this.queue.getNextQuery();

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
      const processResult = await this.queryProcessor.process(query);

      if (!processResult.ok) {
        this.logger.error({
          message: `Processing query ${query.id} failed`,
          error: processResult.error,
          context: { queryId: query.id },
        });

        await this.queue.markAsFailed(query.id);
        this.isRunning = false;
        return;
      }

      this.logger.info(`Processing query ${query.id} finished`);
      const markAsSuccessResult = await this.queue.markAsSuccess(query.id);

      if (!markAsSuccessResult.ok) {
        this.logger.error({
          message: `Marking query ${query.id} as success failed`,
          error: markAsSuccessResult.error,
          context: { queryId: query.id },
        });

        await this.queue.markAsFailed(query.id);
        this.isRunning = false;
        return;
      }
    }
  }
}