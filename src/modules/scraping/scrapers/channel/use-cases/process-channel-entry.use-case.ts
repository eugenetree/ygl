import { injectable } from "inversify";
import { Logger } from "../../../../_common/logger/logger.js";
import { Failure, Result, Success } from "../../../../../types/index.js";
import { BaseError } from "../../../../_common/errors.js";
import { YoutubeApiGetChannel } from "../../../../youtube-api/yt-api-get-channel.js";
import { ChannelRepository } from "../channel.repository.js";
import { ChannelsQueue } from "../../video-discovery/index.js";

@injectable()
export class ProcessChannelEntryUseCase {
  constructor(
    private readonly logger: Logger,
    private readonly youtubeApiGetChannel: YoutubeApiGetChannel,
    private readonly channelRepository: ChannelRepository,
    private readonly channelsQueue: ChannelsQueue,
  ) {
    this.logger.setContext(ProcessChannelEntryUseCase.name);
  }

  public async execute(channelEntryId: string): Promise<Result<void, BaseError>> {
    this.logger.info(`Processing channel entry ${channelEntryId}...`);

    this.logger.info(`Fetching channel ${channelEntryId}.`);

    const fullChannelInfoResult = await this.youtubeApiGetChannel.getChannel(
      channelEntryId,
    );

    if (!fullChannelInfoResult.ok) {
      this.logger.error({
        error: fullChannelInfoResult.error,
        context: { channelId: channelEntryId },
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

    this.logger.info(`Channel ${channelEntryId} saved into db.`);

    const enqueueResult = await this.channelsQueue.enqueue(channelEntryId);
    if (!enqueueResult.ok) {
      this.logger.error({
        message: `Failed to enqueue channel ${channelEntryId} for video discovery`,
        error: enqueueResult.error,
        context: { channelId: channelEntryId },
      });

      return enqueueResult;
    }

    this.logger.info(`Channel ${channelEntryId} enqueued for video discovery.`);

    return Success(undefined);
  }
}
