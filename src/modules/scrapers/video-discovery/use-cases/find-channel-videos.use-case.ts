import { injectable } from "inversify";
import { Logger } from "../../../_common/logger/logger.js";
import { Failure, Result, Success } from "../../../../types/index.js";
import { YoutubeApiGetChannelVideoEntries } from "../../../youtube-api/yt-api-get-channel-video-entries.js";
import { BaseError } from "../../../_common/errors.js";
import { VideoEntryRepository } from "../video-entry.repository.js";
import { VideoEntriesQueue } from "../../video/index.js";
import { ChannelsQueue } from "../channels.queue.js";
import { QueueUseCaseResult } from "../../_common/queue-use-case.types.js";

@injectable()
export class FindChannelVideosUseCase {
  constructor(
    private readonly logger: Logger,
    private readonly videoEntryRepository: VideoEntryRepository,
    private readonly youtubeApiGetChannelVideoEntries: YoutubeApiGetChannelVideoEntries,
    private readonly videoEntriesQueue: VideoEntriesQueue,
    private readonly channelsQueue: ChannelsQueue,
  ) {
    this.logger.setContext(FindChannelVideosUseCase.name);
  }

  public async execute(): Promise<QueueUseCaseResult> {
    const channelResult = await this.channelsQueue.getNextChannel();
    if (!channelResult.ok) {
      return Failure(channelResult.error);
    }

    const channel = channelResult.value;
    if (!channel) {
      return Success({ status: "empty" });
    }

    this.logger.info(`Processing channel ${channel.id}...`);

    const processResult = await this.processChannel(channel.id);

    if (!processResult.ok) {
      this.logger.error({
        message: "Failed to process channel for videos discovery",
        error: processResult.error,
        context: { channelId: channel.id },
      });

      const markAsFailedResult = await this.channelsQueue.markAsFailed(channel.id);
      if (!markAsFailedResult.ok) {
        this.logger.error({
          message: `Failed to mark channel ${channel.id} as failed`,
          error: markAsFailedResult.error,
          context: { channelId: channel.id },
        });

        return Failure(markAsFailedResult.error);
      }

      return Failure(processResult.error);
    }

    this.logger.info(`Processing channel ${channel.id} finished`);

    const markAsSuccessResult = await this.channelsQueue.markAsSuccess(channel.id);
    if (!markAsSuccessResult.ok) {
      this.logger.error({
        message: `Failed to mark channel ${channel.id} as success`,
        error: markAsSuccessResult.error,
        context: { channelId: channel.id },
      });

      return Failure(markAsSuccessResult.error);
    }

    return Success({ status: "processed" });
  }

  private async processChannel(channelId: string): Promise<Result<void, BaseError>> {
    const entriesGenerator = this.youtubeApiGetChannelVideoEntries.getChannelVideoEntries({
      channelId,
    });

    for await (const chunkResult of entriesGenerator) {
      if (!chunkResult.ok) {
        this.logger.error({
          message: "Failed to get channel video entries",
          error: chunkResult.error,
          context: { channelId },
        });

        return chunkResult;
      }

      const chunkResponse = chunkResult.value;

      if (chunkResponse.status === "done") {
        break;
      }

      if (chunkResponse.status === "found") {
        for (const videoEntryResponse of chunkResponse.chunk) {
          const processEntryResult = await this.processVideoEntry(channelId, videoEntryResponse.id);

          if (!processEntryResult.ok) {
            return processEntryResult;
          }
        }
      }
    }

    return Success(undefined);
  }

  private async processVideoEntry(
    channelId: string,
    entryId: string,
  ): Promise<Result<void, BaseError>> {
    this.logger.info(`Processing video entry ${entryId} for channel ${channelId}.`);

    const entryLookupResult = await this.videoEntryRepository.findById(entryId);
    if (!entryLookupResult.ok) {
      this.logger.error({
        message: "Error looking up video entry",
        error: entryLookupResult.error,
        context: { videoId: entryId },
      });

      return entryLookupResult;
    }

    const existingEntry = entryLookupResult.value;
    if (existingEntry) {
      this.logger.info(`Video entry (${entryId}) already exists. Skipping.`);
      return Success(undefined);
    }

    const createEntryResult = await this.videoEntryRepository.create({
      id: entryId,
      channelId,
    });

    if (!createEntryResult.ok) {
      this.logger.error({
        message: "Error creating video entry",
        error: createEntryResult.error,
        context: { videoId: entryId },
      });

      return createEntryResult;
    }

    this.logger.info(`Video entry (${entryId}) created.`);

    const enqueueResult = await this.videoEntriesQueue.enqueue(entryId, channelId);
    if (!enqueueResult.ok) {
      this.logger.error({
        message: "Error enqueuing video",
        error: enqueueResult.error,
        context: { videoId: entryId },
      });

      return enqueueResult;
    }

    this.logger.info(`Video entry (${entryId}) enqueued.`);

    return Success(undefined);
  }
}
