import { injectable } from "inversify";
import { Logger } from "../../../_common/logger/logger.js";
import { ChannelEntryRow } from "../../../../db/types.js";
import { Failure, Result, Success } from "../../../../types/index.js";
import { BaseError } from "../../../_common/errors.js";
import { YoutubeApiGetChannel } from "../../../youtube-api/yt-api-get-channel.js";
import { ChannelRepository } from "../channel.repository.js";

@injectable()
export class ProcessChannelEntryUseCase {
  constructor(
    private readonly logger: Logger,
    private readonly youtubeApiGetChannel: YoutubeApiGetChannel,
    private readonly channelRepository: ChannelRepository,
  ) {
    this.logger.setContext(ProcessChannelEntryUseCase.name);
  }

  public async execute(entry: ChannelEntryRow): Promise<Result<{ id: string }, BaseError | any>> {
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

    const createChannelResult = await this.channelRepository.create(fullChannelInfo);

    if (!createChannelResult.ok) {
      this.logger.error({
        error: createChannelResult.error,
        context: { channelId: fullChannelInfo.id },
      });

      return Failure(createChannelResult.error);
    }

    return Success({ id: createChannelResult.value.id });
  }
}
