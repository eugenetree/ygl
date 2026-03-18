import { injectable } from "inversify";
import { Logger } from "../../../_common/logger/logger.js";
import { Failure, Result, Success } from "../../../../types/index.js";
import { BaseError } from "../../../_common/errors.js";
import { YoutubeApiGetChannel } from "../../../youtube-api/yt-api-get-channel.js";
import { ChannelRepository } from "../channel.repository.js";
import { ChannelsQueue } from "../../video-discovery/index.js";
import { ChannelEntriesQueue } from "../channel-entries.queue.js";
import { QueueUseCaseResult } from "../../_common/queue-use-case.types.js";

@injectable()
export class ProcessChannelEntryUseCase {
  constructor(
    private readonly logger: Logger,
    private readonly youtubeApiGetChannel: YoutubeApiGetChannel,
    private readonly channelRepository: ChannelRepository,
    private readonly channelsQueue: ChannelsQueue,
    private readonly channelEntriesQueue: ChannelEntriesQueue,
  ) {
    this.logger.setContext(ProcessChannelEntryUseCase.name);
  }

  public async execute(): Promise<QueueUseCaseResult> {
    const entryResult = await this.channelEntriesQueue.getNextEntry();
    if (!entryResult.ok) {
      return Failure(entryResult.error);
    }

    const entry = entryResult.value;
    if (!entry) {
      return Success({ status: "empty" });
    }

    this.logger.info(`Processing channel entry ${entry.id}...`);

    const processResult = await this.processEntry(entry.id);

    if (!processResult.ok) {
      this.logger.error({
        message: `Failed to process channel entry ${entry.id}`,
        error: processResult.error,
        context: { entryId: entry.id },
      });

      const markAsFailedResult = await this.channelEntriesQueue.markAsFailed(entry.id);
      if (!markAsFailedResult.ok) {
        this.logger.error({
          message: `Failed to mark channel entry ${entry.id} as failed`,
          error: markAsFailedResult.error,
          context: { entryId: entry.id },
        });

        return Failure(markAsFailedResult.error);
      }

      return Failure(processResult.error);
    }

    this.logger.info(`Processing channel entry ${entry.id} finished`);

    const markAsSuccessResult = await this.channelEntriesQueue.markAsSuccess(entry.id);
    if (!markAsSuccessResult.ok) {
      this.logger.error({
        message: `Failed to mark channel entry ${entry.id} as success`,
        error: markAsSuccessResult.error,
        context: { entryId: entry.id },
      });

      return Failure(markAsSuccessResult.error);
    }

    return Success({ status: "processed" });
  }

  private async processEntry(channelId: string): Promise<Result<void, BaseError>> {
    this.logger.info(`Fetching channel ${channelId}.`);

    const fullChannelInfoResult = await this.youtubeApiGetChannel.getChannel(
      channelId,
    );

    if (!fullChannelInfoResult.ok) {
      this.logger.error({
        error: fullChannelInfoResult.error,
        context: { channelId },
      });

      return fullChannelInfoResult;
    }

    const fullChannelInfo = fullChannelInfoResult.value;

    const createChannelResult = await this.channelRepository.create(fullChannelInfo);
    if (!createChannelResult.ok) {
      this.logger.error({
        error: createChannelResult.error,
        context: { channelId: fullChannelInfo.id },
      });

      return createChannelResult;
    }

    this.logger.info(`Channel ${channelId} saved into db.`);

    const enqueueResult = await this.channelsQueue.enqueue(channelId);
    if (!enqueueResult.ok) {
      this.logger.error({
        message: `Failed to enqueue channel ${channelId} for video discovery`,
        error: enqueueResult.error,
        context: { channelId },
      });

      return enqueueResult;
    }

    this.logger.info(`Channel ${channelId} enqueued for video discovery.`);

    return Success(undefined);
  }
}
