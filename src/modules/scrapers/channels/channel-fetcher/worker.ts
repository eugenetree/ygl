import { injectable } from "inversify";
import { Logger } from "../../../_common/logger/logger.js";
import { ChannelFetcherQueueOrchestrator } from "./queue-orchestrator.js";
import { ChannelFetcherEntryProcessor } from "./entry-processor.js";

@injectable()
export class ChannelFetcherWorker {
  private isRunning: boolean = false;

  constructor(
    private readonly logger: Logger,
    private readonly queueOrchestrator: ChannelFetcherQueueOrchestrator,
    private readonly entryProcessor: ChannelFetcherEntryProcessor,
  ) { }

  public async start() {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;

    while (this.isRunning) {
      const entryResult = await this.queueOrchestrator.getNextEntry();

      if (!entryResult.ok) {
        this.logger.error({
          error: entryResult.error,
        });

        this.isRunning = false;
        return;
      }

      const entry = entryResult.value;

      if (!entry) {
        this.logger.info("No PENDING search-channel-entries found. Waiting...");
        await new Promise((resolve) => setTimeout(resolve, 1000 * 60));
        continue;
      }

      this.logger.info(`Processing channel entry ${entry.id}`);
      const processResult = await this.entryProcessor.process(entry);

      if (!processResult.ok) {
        this.logger.error({
          error: processResult.error,
          context: { entryId: entry.id },
        });

        // E.g if it's a deleted channel, mark it as FAILED
        await this.queueOrchestrator.markAsFailed(entry.id);
        continue;
      }

      const markAsSuccessResult = await this.queueOrchestrator.markAsSuccess(entry.id);

      if (!markAsSuccessResult.ok) {
        this.logger.error({
          error: markAsSuccessResult.error,
          context: { entryId: entry.id },
        });

        await this.queueOrchestrator.markAsFailed(entry.id);
        this.isRunning = false;
        return;
      }
    }
  }
}
