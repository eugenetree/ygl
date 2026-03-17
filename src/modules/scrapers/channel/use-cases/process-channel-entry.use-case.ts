import { injectable } from "inversify";
import { Logger } from "../../../_common/logger/logger.js";
import { Failure, Result, Success } from "../../../../types/index.js";
import { BaseError } from "../../../_common/errors.js";
import { YoutubeApiGetChannel } from "../../../youtube-api/yt-api-get-channel.js";
import { ChannelRepository } from "../channel.repository.js";
import { ChannelsQueue } from "../../video-discovery/index.js";

type Input = {
  channelId: string;
}

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

  public async execute({ channelId }: Input): Promise<Result<void, BaseError>> {
    this.logger.info(`Fetching channel ${channelId}.`);

    const fullChannelInfoResult = await this.youtubeApiGetChannel.getChannel(
      channelId,
    );

    if (!fullChannelInfoResult.ok) {
      this.logger.error({
        error: fullChannelInfoResult.error,
        context: { channelId },
      });

      return Failure(fullChannelInfoResult.error);
    }

    const fullChannelInfo = fullChannelInfoResult.value;

    const createChannelResult = await this.channelRepository.create(fullChannelInfo);
    if (!createChannelResult.ok) {
      this.logger.error({
        error: createChannelResult.error,
        context: { channelId: fullChannelInfo.id },
      });

      return Failure(createChannelResult.error);
    }

    this.logger.info(`Channel ${channelId} saved into db.`);

    const enqueueResult = await this.channelsQueue.enqueue(channelId);
    if (!enqueueResult.ok) {
      this.logger.error({
        message: `Failed to enqueue channel ${channelId} for video discovery`,
        error: enqueueResult.error,
        context: { channelId },
      });

      return Failure(enqueueResult.error);
    }

    this.logger.info(`Channel ${channelId} enqueued for video discovery.`);

    return Success(undefined);
  }
}
