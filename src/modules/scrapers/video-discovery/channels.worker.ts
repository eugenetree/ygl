import { injectable } from "inversify";
import { Logger } from "../../_common/logger/logger.js";
import { ChannelsQueue } from "./channels.queue.js";
import { ChannelsProcessor } from "./channels.processor.js";

@injectable()
export class ChannelsWorker {
  private isRunning: boolean = false;

  constructor(
    private readonly logger: Logger,
    private readonly channelsQueue: ChannelsQueue,
    private readonly channelsProcessor: ChannelsProcessor,
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

      const channelResult = await this.channelsQueue.getNextChannel();

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
        this.logger.info("Channels queue is empty. Waiting...");
        await new Promise((resolve) => setTimeout(resolve, 1000 * 60));
        continue;
      }

      this.logger.info(`Processing channel ${channel.id}...`);
      const processResult = await this.channelsProcessor.process(channel);

      if (!processResult.ok) {
        this.logger.error({
          message: "Failed to process channel for videos discovery",
          error: processResult.error,
          context: { channelId: channel.id },
        });

        await this.channelsQueue.markAsFailed(channel.id);
        this.isRunning = false;
        return;
      }

      this.logger.info(`Processing channel ${channel.id} finished`);

      const markAsSuccessResult = await this.channelsQueue.markAsSuccess(channel.id);

      if (!markAsSuccessResult.ok) {
        this.logger.error({
          message: `Failed to mark channel ${channel.id} as success`,
          error: markAsSuccessResult.error,
          context: { channelId: channel.id },
        });

        await this.channelsQueue.markAsFailed(channel.id);
        this.isRunning = false;
        return;
      }
    }
  }
}
