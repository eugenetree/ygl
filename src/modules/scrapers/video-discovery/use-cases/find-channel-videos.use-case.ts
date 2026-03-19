import { injectable } from "inversify";
import { Logger } from "../../../_common/logger/logger.js";
import { Result, Success } from "../../../../types/index.js";
import { BaseError } from "../../../_common/errors.js";
import { YoutubeApiGetChannelVideoEntries } from "../../../youtube-api/yt-api-get-channel-video-entries.js";
import { VideoEntryRepository } from "../video-entry.repository.js";
import { VideoEntriesQueue } from "../../video/index.js";

@injectable()
export class FindChannelVideosUseCase {
  constructor(
    private readonly logger: Logger,
    private readonly videoEntryRepository: VideoEntryRepository,
    private readonly youtubeApiGetChannelVideoEntries: YoutubeApiGetChannelVideoEntries,
    private readonly videoEntriesQueue: VideoEntriesQueue,
  ) {
    this.logger.setContext(FindChannelVideosUseCase.name);
  }

  public async execute(channelId: string): Promise<Result<void, BaseError>> {
    this.logger.info(`Processing channel ${channelId}...`);

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

    this.logger.info(`Processing channel ${channelId} finished`);

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
