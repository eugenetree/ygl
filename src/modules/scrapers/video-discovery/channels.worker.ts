import { injectable } from "inversify";
import { Logger } from "../../_common/logger/logger.js";
import { FindChannelVideosUseCase } from "./use-cases/find-channel-videos.use-case.js";

@injectable()
export class ChannelsWorker {
  private isRunning: boolean = false;

  constructor(
    private readonly logger: Logger,
    private readonly findChannelVideos: FindChannelVideosUseCase,
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

      const result = await this.findChannelVideos.execute();

      if (!result.ok) {
        this.logger.error({
          message: "Failed to fetch next channel for videos discovery",
          error: result.error,
        });
        this.isRunning = false;
        return;
      }

      if (result.value.status === "empty") {
        this.logger.info("Channels queue is empty. Waiting...");
        await new Promise((resolve) => setTimeout(resolve, 1000 * 60));
        continue;
      }

      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  }
}
