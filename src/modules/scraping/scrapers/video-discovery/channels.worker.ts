import { injectable } from "inversify";
import { Failure, type Result, Success } from "../../../../types/index.js";
import type { BaseError } from "../../../_common/errors.js";
import type { Logger } from "../../../_common/logger/logger.js";
import { WorkerStopCause } from "../../constants.js";
import type { ChannelsQueue } from "./channels.queue.js";
import type { FindChannelVideosUseCase } from "./use-cases/find-channel-videos.use-case.js";

type WorkerOptions = {
  shouldContinue: () => boolean;
  onError: (error: BaseError) => Promise<void>;
};

@injectable()
export class ChannelsWorker {
  private isRunning: boolean = false;

  constructor(
    logger: Logger,
    private readonly findChannelVideos: FindChannelVideosUseCase,
    private readonly channelsQueue: ChannelsQueue,
  ) {
    this.logger = logger.child({
      context: "ChannelsWorker",
      category: "worker-channel-videos-discovery",
    });
  }

  private readonly logger: Logger;

  public async run({
    shouldContinue,
    onError,
  }: WorkerOptions): Promise<Result<WorkerStopCause, BaseError>> {
    if (this.isRunning) {
      return Failure({ type: "WORKER_ALREADY_RUNNING" });
    }

    this.isRunning = true;

    while (this.isRunning) {
      if (!shouldContinue()) {
        this.logger.info("shouldContinue() returned false. Stopping worker.");
        this.isRunning = false;
        return Success(WorkerStopCause.STOPPED);
      }

      const channelResult = await this.channelsQueue.getNextChannel();

      if (!channelResult.ok) {
        this.logger.error({
          message: "Failed to fetch next channel for videos discovery",
          error: channelResult.error,
        });
        this.isRunning = false;
        await onError(channelResult.error);
        return channelResult;
      }

      const channel = channelResult.value;

      if (!channel) {
        this.logger.info("Channels queue is empty.");
        this.isRunning = false;
        return Success(WorkerStopCause.EMPTY);
      }

      const result = await this.findChannelVideos.execute(channel.id);

      if (!result.ok) {
        if (result.error.type === "CHANNEL_NOT_FOUND") {
          this.logger.info(
            `Channel ${channel.id} does not exist on YouTube. Skipping.`,
          );
          await this.channelsQueue.markAsSkipped(
            channel.id,
            "CHANNEL_NOT_FOUND",
          );
          continue;
        }

        await this.channelsQueue.markAsFailed(channel.id);
        this.isRunning = false;
        await onError(result.error);
        return result;
      }

      await this.channelsQueue.markAsSuccess(channel.id);

      await new Promise((resolve) =>
        setTimeout(resolve, 5000 + Math.random() * 5000),
      );
    }

    return Success(WorkerStopCause.DONE);
  }
}
