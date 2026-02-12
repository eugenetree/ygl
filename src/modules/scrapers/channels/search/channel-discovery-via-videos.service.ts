import { injectable } from "inversify";
import { Failure, Success } from "../../../../types/index.js";
import { Logger } from "../../../_common/logger/logger.js";
import { YoutubeApiGetChannel } from "../../../youtube-api/yt-api-get-channel.js";
import {
  SearchChannelEntry,
  YoutubeApiSearchChannelsViaVideos,
} from "../../../youtube-api/yt-api-search-channels-via-videos.js";
import { ChannelRepository } from "./channel.repository.js";
import {
  CHANNEL_SUBS_MIN,
} from "./constants.js";
import { ChannelService } from "../../../domain/channel.service.js";

@injectable()
export class ChannelDiscoveryViaVideosService {
  constructor(
    private readonly logger: Logger,
    private readonly youtubeApiSearchChannels: YoutubeApiSearchChannelsViaVideos,
    private readonly youtubeApiGetChannel: YoutubeApiGetChannel,
    private readonly channelRepository: ChannelRepository,
    private readonly channelService: ChannelService,
  ) {
    this.logger.setContext(ChannelDiscoveryViaVideosService.name);
  }

  async discoverByQuery(query: string) {
    this.logger.info(`Processing query via videos: ${query}`);

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
        for (const channelEntry of searchResponse.chunk) {
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
      `Processing ${channelEntries.length} unique channels from query ${query}`,
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

    this.logger.info(`Saving channel ${fullChannelInfo.id} into db.`);

    const createChannelResult =
      await this.channelRepository.create(
        this.channelService.create({
          ...fullChannelInfo,
          discoveryStrategy: "via-videos"
        })
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
