import { injectable } from "inversify";
import { Logger } from "../../../_common/logger/logger.js";
import { QueueOrchestrator } from "./queue-orchestrator.js";
import { QueryProcessor } from "./query-processor.js";

@injectable()
export class ChannelDiscoveryWorker {
  private isRunning: boolean = false;

  constructor(
    private readonly logger: Logger,
    private readonly queueOrchestrator: QueueOrchestrator,
    private readonly queueProcessor: QueryProcessor,
  ) { }

  public async start() {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;

    while (this.isRunning) {
      const queryResult = await this.queueOrchestrator.getNextQuery();

      if (!queryResult.ok) {
        this.logger.error({
          error: queryResult.error,
        });

        this.isRunning = false;
        return;
      }

      const query = queryResult.value;

      if (!query) {
        this.logger.info("No search-channel-via-videos queries found. Waiting...");
        await new Promise((resolve) => setTimeout(resolve, 1000 * 60));
        continue;
      }

      this.logger.info(`Processing query ${query.id}`);
      const processResult = await this.queueProcessor.process(query);

      if (!processResult.ok) {
        this.logger.error({
          error: processResult.error,
          context: { queryId: query.id },
        });

        await this.queueOrchestrator.markAsFailed(query.id);
        this.isRunning = false;
        return;
      }

      const markAsSuccessResult = await this.queueOrchestrator.markAsSuccess(query.id);

      if (!markAsSuccessResult.ok) {
        this.logger.error({
          error: markAsSuccessResult.error,
          context: { queryId: query.id },
        });

        await this.queueOrchestrator.markAsFailed(query.id);
        this.isRunning = false;
        return;
      }
    }
  }
}