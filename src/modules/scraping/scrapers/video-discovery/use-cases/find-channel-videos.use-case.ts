import { injectable } from "inversify";
import { Logger } from "../../../../_common/logger/logger.js";
import { Result, Success } from "../../../../../types/index.js";
import { BaseError } from "../../../../_common/errors.js";
import { ChannelVideoEntry, YoutubeApiGetChannelVideoEntries } from "../../../../youtube-api/yt-api-get-channel-video-entries.js";
import { VideoEntryRepository } from "../video-entry.repository.js";
import { VideoEntriesQueue } from "../../video/index.js";
import { VideoEntryAvailability } from "../video-entry.js";

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
          const processEntryResult = await this.processVideoEntry(channelId, videoEntryResponse);

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
    entry: ChannelVideoEntry,
  ): Promise<Result<void, BaseError>> {
    this.logger.info(`Processing video entry ${entry.id} for channel ${channelId}.`);

    const entryLookupResult = await this.videoEntryRepository.findById(entry.id);
    if (!entryLookupResult.ok) {
      this.logger.error({
        message: "Error looking up video entry",
        error: entryLookupResult.error,
        context: { videoId: entry.id },
      });

      return entryLookupResult;
    }

    const existingEntry = entryLookupResult.value;
    if (existingEntry) {
      this.logger.info(`Video entry (${entry.id}) already exists. Skipping.`);
      return Success(undefined);
    }

    const availability: VideoEntryAvailability = entry.availability === "subscriber_only" ? "MEMBERS_ONLY" : "PUBLIC";

    const createEntryResult = await this.videoEntryRepository.create({
      id: entry.id,
      channelId,
      availability,
    });

    if (!createEntryResult.ok) {
      this.logger.error({
        message: "Error creating video entry",
        error: createEntryResult.error,
        context: { videoId: entry.id },
      });

      return createEntryResult;
    }

    this.logger.info(`Video entry (${entry.id}) created.`);

    if (availability !== "PUBLIC") {
      this.logger.info(`Video entry (${entry.id}) is ${availability}. Skipping enqueue.`);
      return Success(undefined);
    }

    const enqueueResult = await this.videoEntriesQueue.enqueue(entry.id, channelId);
    if (!enqueueResult.ok) {
      this.logger.error({
        message: "Error enqueuing video",
        error: enqueueResult.error,
        context: { videoId: entry.id },
      });

      return enqueueResult;
    }

    this.logger.info(`Video entry (${entry.id}) enqueued.`);

    return Success(undefined);
  }
}
