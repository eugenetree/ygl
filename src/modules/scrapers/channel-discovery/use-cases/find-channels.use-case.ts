import { injectable } from "inversify";
import { Logger } from "../../../_common/logger/logger.js";
import { SearchChannelQuery } from "../../../domain/search-channel-query.js";
import { Failure, Result, Success } from "../../../../types/index.js";
import { BaseError } from "../../../_common/errors.js";
import { SearchChannelEntry as YoutubeSearchChannelEntry, YoutubeApiSearchChannelsViaVideos } from "../../../youtube-api/yt-api-search-channels-via-videos.js";
import { ChannelEntryRepository } from "../channel-entry.repository.js";
import { ChannelEntriesQueue } from "../../channel/index.js";

@injectable()
export class FindChannelsUseCase {
  constructor(
    private readonly logger: Logger,
    private readonly youtubeApiSearchChannels: YoutubeApiSearchChannelsViaVideos,
    private readonly channelEntryRepository: ChannelEntryRepository,
    private readonly channelEntriesQueue: ChannelEntriesQueue,
  ) {
    this.logger.setContext(FindChannelsUseCase.name);
  }

  public async execute(queryRecord: SearchChannelQuery) {
    const searchGenerator = this.youtubeApiSearchChannels.searchChannels({
      query: queryRecord.query,
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
          const processChannelEntryResult = await this.processChannelEntry({
            queryId: queryRecord.id,
            channelEntry,
          });

          if (!processChannelEntryResult.ok) {
            return Failure(processChannelEntryResult.error);
          }
        }
      }
    }

    return Success(undefined);
  }

  private async processChannelEntry({
    queryId,
    channelEntry,
  }: {
    queryId: string;
    channelEntry: YoutubeSearchChannelEntry;
  }) {
    this.logger.info(`Processing channel entry ${channelEntry.id}.`);

    const entryLookupResult = await this.channelEntryRepository.findById(
      channelEntry.id,
    );

    if (!entryLookupResult.ok) {
      this.logger.error({
        error: entryLookupResult.error,
        context: { channelId: channelEntry.id },
      });

      return Failure(entryLookupResult.error);
    }

    const existingChannel = entryLookupResult.value;
    if (existingChannel) {
      this.logger.info(
        `Channel (${existingChannel.id}) already exists in db. Skipping.`,
      );

      return Success(undefined);
    }

    const createChannelEntryResult =
      await this.channelEntryRepository.create({ id: channelEntry.id, queryId });

    if (!createChannelEntryResult.ok) {
      this.logger.error({
        error: createChannelEntryResult.error,
        context: { channelId: channelEntry.id },
      });

      return Failure(createChannelEntryResult.error);
    }

    const enqueueResult = await this.channelEntriesQueue.enqueue(channelEntry.id);

    if (!enqueueResult.ok) {
      this.logger.error({
        error: enqueueResult.error,
        context: { channelId: channelEntry.id },
      });

      return Failure(enqueueResult.error);
    }

    return Success(undefined);
  }
}
