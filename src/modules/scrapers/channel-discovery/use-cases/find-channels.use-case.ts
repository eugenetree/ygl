import { injectable } from "inversify";
import { Logger } from "../../../_common/logger/logger.js";
import { Failure, Result, Success } from "../../../../types/index.js";
import { BaseError } from "../../../_common/errors.js";
import { SearchChannelEntry as YoutubeSearchChannelEntry, YoutubeApiSearchChannelsViaVideos } from "../../../youtube-api/yt-api-search-channels-via-videos.js";
import { ChannelEntryRepository } from "../channel-entry.repository.js";
import { ChannelEntriesQueue } from "../../channel/index.js";
import { SearchChannelQueriesQueue } from "../search-channel-queries.queue.js";
import { QueueUseCaseResult } from "../../_common/queue-use-case.types.js";

@injectable()
export class FindChannelsUseCase {
  constructor(
    private readonly logger: Logger,
    private readonly youtubeApiSearchChannels: YoutubeApiSearchChannelsViaVideos,
    private readonly channelEntryRepository: ChannelEntryRepository,
    private readonly channelEntriesQueue: ChannelEntriesQueue,
    private readonly searchChannelQueriesQueue: SearchChannelQueriesQueue,
  ) {
    this.logger.setContext(FindChannelsUseCase.name);
  }

  public async execute(): Promise<QueueUseCaseResult> {
    const queryResult = await this.searchChannelQueriesQueue.getNextQuery();
    if (!queryResult.ok) {
      return Failure(queryResult.error);
    }

    const query = queryResult.value;
    if (!query) {
      return Success({ status: "empty" });
    }

    this.logger.info(`Processing search query ${query.id}...`);

    const processResult = await this.processQuery({
      queryId: query.id,
      queryText: query.query,
    });

    if (!processResult.ok) {
      this.logger.error({
        message: `Processing search query ${query.id} failed`,
        error: processResult.error,
        context: { queryId: query.id },
      });

      const markAsFailedResult = await this.searchChannelQueriesQueue.markAsFailed(query.id);
      if (!markAsFailedResult.ok) {
        this.logger.error({
          message: `Marking search query ${query.id} as failed failed`,
          error: markAsFailedResult.error,
          context: { queryId: query.id },
        });

        return Failure(markAsFailedResult.error);
      }

      return Failure(processResult.error);
    }

    this.logger.info(`Processing search query ${query.id} finished`);

    const markAsSuccessResult = await this.searchChannelQueriesQueue.markAsSuccess(query.id);
    if (!markAsSuccessResult.ok) {
      this.logger.error({
        message: `Marking search query ${query.id} as success failed`,
        error: markAsSuccessResult.error,
        context: { queryId: query.id },
      });

      return Failure(markAsSuccessResult.error);
    }

    return Success({ status: "processed" });
  }

  private async processQuery({ queryId, queryText }: { queryId: string; queryText: string }): Promise<Result<void, BaseError>> {
    const searchGenerator = this.youtubeApiSearchChannels.searchChannels({
      query: queryText,
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
            queryId,
            channelEntry,
          });

          if (!processChannelEntryResult.ok) {
            return processChannelEntryResult;
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

    this.logger.info(`Channel entry ${channelEntry.id} created.`);

    const enqueueResult = await this.channelEntriesQueue.enqueue(channelEntry.id);
    if (!enqueueResult.ok) {
      this.logger.error({
        error: enqueueResult.error,
        context: { channelId: channelEntry.id },
      });

      return Failure(enqueueResult.error);
    }

    this.logger.info(`Channel entry ${channelEntry.id} enqueued for next step.`);

    return Success(undefined);
  }
}
