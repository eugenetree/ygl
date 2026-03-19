import { injectable } from "inversify";
import { Logger } from "../../_common/logger/logger.js";
import { FindChannelVideosUseCase } from "./use-cases/find-channel-videos.use-case.js";
import { ChannelsQueue } from "./channels.queue.js";

@injectable()
export class ChannelsWorker {
  private isRunning: boolean = false;

  constructor(
    private readonly logger: Logger,
    private readonly findChannelVideos: FindChannelVideosUseCase,
    private readonly channelsQueue: ChannelsQueue,
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

      const result = await this.findChannelVideos.execute(channel.id);

      if (!result.ok) {
        await this.channelsQueue.markAsFailed(channel.id);
        continue;
      }

      await this.channelsQueue.markAsSuccess(channel.id);

      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  }
}
