import { injectable } from "inversify";
import { Logger } from "../../_common/logger/logger.js";
import { ChannelEntryRow } from "../../../db/types.js";
import { Failure, Result, Success } from "../../../types/index.js";
import { BaseError } from "../../_common/errors.js";
import { YoutubeApiGetChannel } from "../../youtube-api/yt-api-get-channel.js";
import { ChannelService } from "../../domain/channel.service.js";
import { ChannelRepository } from "./channel.repository.js";

@injectable()
export class ChannelEntriesProcessor {
  constructor(
    private readonly logger: Logger,
    private readonly youtubeApiGetChannel: YoutubeApiGetChannel,
    private readonly channelRepository: ChannelRepository,
    private readonly channelService: ChannelService,
  ) {
    this.logger.setContext(ChannelEntriesProcessor.name);
  }

  public async process(entry: ChannelEntryRow): Promise<Result<void, BaseError | any>> {
    this.logger.info(`Fetching channel ${entry.id} via Youtube API.`);

    const fullChannelInfoResult = await this.youtubeApiGetChannel.getChannel(
      entry.id,
    );

    if (!fullChannelInfoResult.ok) {
      this.logger.error({
        error: fullChannelInfoResult.error,
        context: { channelId: entry.id },
      });

      return Failure(fullChannelInfoResult.error);
    }

    const fullChannelInfo = fullChannelInfoResult.value;

    this.logger.info(`Validating and saving channel ${fullChannelInfo.id} into db.`);

    const domainChannel = this.channelService.create(fullChannelInfo);

    // TODO: Could apply CHANNEL_SUBS_MIN filter here if needed

    const createChannelResult = await this.channelRepository.create(domainChannel);

    if (!createChannelResult.ok) {
      this.logger.error({
        error: createChannelResult.error,
        context: { channelId: fullChannelInfo.id },
      });

      return Failure(createChannelResult.error);
    }

    return Success(undefined);
  }
}
