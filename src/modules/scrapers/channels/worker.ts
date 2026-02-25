import { injectable } from "inversify";
import { Logger } from "../../_common/logger/logger.js";
import { Queue } from "./channels.queue.js";
import { QueryProcessor } from "./query-processor.js";

@injectable()
export class ChannelVideosDiscoveryWorker {
  private isRunning: boolean = false;

  constructor(
    private readonly logger: Logger,
    private readonly queueOrchestrator: Queue,
    private readonly queueProcessor: QueryProcessor,
  ) { }

  public async start() {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;

    while (this.isRunning) {
      const channelResult = await this.queueOrchestrator.getNextChannel();

      if (!channelResult.ok) {
        this.logger.error({
          message: "Failed to fetch next channel for videos discovery",
          error: channelResult.error,
        });

        this.isRunning = false;
        return;
      }

      const channel = channelResult.value;

      if (!channel) {
        this.logger.info("No channels waiting for videos discovery found. Waiting...");
        await new Promise((resolve) => setTimeout(resolve, 1000 * 60));
        continue;
      }

      this.logger.info(`Discovering videos for channel ${channel.id}`);
      const processResult = await this.queueProcessor.process(channel);

      if (!processResult.ok) {
        this.logger.error({
          message: "Failed to process channel for videos discovery",
          error: processResult.error,
          context: { channelId: channel.id },
        });

        await this.queueOrchestrator.markAsFailed(channel.id);
        this.isRunning = false;
        return;
      }

      const markAsSuccessResult = await this.queueOrchestrator.markAsSuccess(channel.id);

      if (!markAsSuccessResult.ok) {
        this.logger.error({
          message: "Failed to mark channel videos discovery as success",
          error: markAsSuccessResult.error,
          context: { channelId: channel.id },
        });

        await this.queueOrchestrator.markAsFailed(channel.id);
        this.isRunning = false;
        return;
      }
    }
  }
}
