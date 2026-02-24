import { injectable } from "inversify";
import { Failure, Success } from "../../../../types/index.js";
import { Logger } from "../../../_common/logger/logger.js";
import { YoutubeApiGetChannel } from "../../../youtube-api/yt-api-get-channel.js";
import {
  SearchChannelEntry,
  YoutubeApiSearchChannelsDirect,
} from "../../../youtube-api/yt-api-search-channels-direct.js";
import { ChannelRepository } from "./channel.repository.js";
import {
  CHANNEL_SUBS_MIN,
  CHANNEL_VIDEOS_MIN,
  CHANNEL_VIEWS_MIN,
} from "./constants.js";
import { ChannelService } from "../../../domain/channel.service.js";

@injectable()
export class ChannelDiscoveryDirectService {
  constructor(
    private readonly logger: Logger,
    private readonly youtubeApiSearchChannels: YoutubeApiSearchChannelsDirect,
    private readonly youtubeApiGetChannel: YoutubeApiGetChannel,
    private readonly channelRepository: ChannelRepository,
    private readonly channelService: ChannelService,
  ) {
    this.logger.setContext(ChannelDiscoveryDirectService.name);
  }

  async discoverByQuery(query: string) {
    this.logger.info(`Processing query: ${query}`);

    const searchGenerator = this.youtubeApiSearchChannels.searchChannels({
      query,
    });

    for await (const searchResult of searchGenerator) {
      if (!searchResult.ok) {
        return Failure(searchResult.error);
      }

      const searchResponse = searchResult.value;

      if (searchResponse.status === "done") {
        break;
      }

      if (searchResponse.status === "found") {
        const channelEntries = await this.filterChannelEntries(
          query,
          searchResponse.chunk,
        );

        for (const channelEntry of channelEntries) {
          await this.processChannel(channelEntry);
        }
      }
    }

    return Success(undefined);
  }

  private async filterChannelEntries(
    query: string,
    channelEntries: SearchChannelEntry[],
  ) {
    this.logger.info(
      `Processing ${channelEntries.length} channels from query ${query}`,
    );

    const channelEntriesWithEnoughSubs = channelEntries.filter(
      (entry) => (entry.subscriberCount || 0) > CHANNEL_SUBS_MIN,
    );

    this.logger.info(
      `${channelEntriesWithEnoughSubs.length}/${channelEntries.length} channels meet the subs count filter criteria.`,
    );

    return channelEntriesWithEnoughSubs;
  }

  private async processChannel(channelEntry: SearchChannelEntry) {
    this.logger.info(`Processing channel ${channelEntry.id}.`);

    const channelLookupResult = await this.channelRepository.findById(
      channelEntry.id,
    );

    if (!channelLookupResult.ok) {
      this.logger.error({
        error: channelLookupResult.error,
        context: { channelId: channelEntry.id },
      });

      return Failure(channelLookupResult.error);
    }

    const existingChannel = channelLookupResult.value;
    if (existingChannel) {
      this.logger.info(
        `Channel ${existingChannel.name} (${existingChannel.id}) already exists in db. Skipping.`,
      );

      return Success(undefined);
    }

    const fullChannelInfoResult = await this.youtubeApiGetChannel.getChannel(
      channelEntry.id,
    );

    if (!fullChannelInfoResult.ok) {
      this.logger.error({
        error: fullChannelInfoResult.error,
        context: { channelId: channelEntry.id },
      });

      return Failure(fullChannelInfoResult.error);
    }

    const fullChannelInfo = fullChannelInfoResult.value;
    const { subscriberCount, viewCount, videoCount } = fullChannelInfo;

    if (
      subscriberCount < CHANNEL_SUBS_MIN ||
      viewCount < CHANNEL_VIEWS_MIN ||
      videoCount < CHANNEL_VIDEOS_MIN
    ) {
      this.logger.info(
        `Channel ${fullChannelInfo.id} does not meet the criteria.` +
        `Skipping. ${subscriberCount} subs, ${viewCount} views, ${videoCount} videos`,
      );

      return Success(undefined);
    }

    this.logger.info(`Saving channel ${fullChannelInfo.id} into db.`);

    const createChannelResult =
      await this.channelRepository.create(
        this.channelService.create(fullChannelInfo)
      );

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



