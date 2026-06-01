import { injectable } from "inversify";
import { Failure, type Result, Success } from "../../../../../types/index.js";
import type { BaseError } from "../../../../_common/errors.js";
import type { Logger } from "../../../../_common/logger/logger.js";
import type { YoutubeApiGetChannel } from "../../../../youtube-api/yt-api-get-channel.js";
import type { ChannelPriorityService } from "../../../channel-priority/channel-priority.service.js";
import type { ChannelsQueue } from "../../video-discovery/index.js";
import type { ChannelRepository } from "../channel.repository.js";

@injectable()
export class ProcessChannelEntryUseCase {
  constructor(
    private readonly logger: Logger,
    private readonly youtubeApiGetChannel: YoutubeApiGetChannel,
    private readonly channelRepository: ChannelRepository,
    private readonly channelsQueue: ChannelsQueue,
    private readonly channelPriorityService: ChannelPriorityService,
  ) {
    this.logger.setContext(ProcessChannelEntryUseCase.name);
  }

  public async execute(
    channelEntryId: string,
  ): Promise<Result<void, BaseError>> {
    this.logger.info(`Processing channel entry ${channelEntryId}...`);

    this.logger.info(`Fetching channel ${channelEntryId}.`);

    const fullChannelInfoResult =
      await this.youtubeApiGetChannel.getChannel(channelEntryId);

    if (!fullChannelInfoResult.ok) {
      this.logger.error({
        error: fullChannelInfoResult.error,
        context: { channelId: channelEntryId },
      });

      return fullChannelInfoResult;
    }

    const fullChannelInfo = fullChannelInfoResult.value;

    const createChannelResult =
      await this.channelRepository.create(fullChannelInfo);
    if (!createChannelResult.ok) {
      this.logger.error({
        error: createChannelResult.error,
        context: { channelId: fullChannelInfo.id },
      });

      return createChannelResult;
    }

    this.logger.info(`Channel ${channelEntryId} saved into db.`);

    const priorityResult =
      await this.channelPriorityService.recalculateScore(channelEntryId);
    if (!priorityResult.ok) {
      this.logger.error({
        message: `Failed to recalculate priority for channel ${channelEntryId}`,
        error: priorityResult.error,
        context: { channelId: channelEntryId },
      });

      return Failure(priorityResult.error);
    }

    const enqueueResult = await this.channelsQueue.enqueue(
      channelEntryId,
      priorityResult.value.scrapingScore,
    );
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
