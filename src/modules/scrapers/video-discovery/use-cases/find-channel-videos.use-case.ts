import { injectable } from "inversify";
import { Logger } from "../../../_common/logger/logger.js";
import { Failure, Result, Success } from "../../../../types/index.js";
import { YoutubeApiGetChannelVideoEntries } from "../../../youtube-api/yt-api-get-channel-video-entries.js";
import { BaseError } from "../../../_common/errors.js";
import { VideoEntryRepository } from "../video-entry.repository.js";
import { VideoEntriesQueue } from "../../video/index.js";

type ProcessError = BaseError;

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

  public async execute(channel: { id: string }): Promise<Result<void, ProcessError>> {
    const entriesGenerator = this.youtubeApiGetChannelVideoEntries.getChannelVideoEntries({
      channelId: channel.id,
    });

    for await (const chunkResult of entriesGenerator) {
      if (!chunkResult.ok) {
        this.logger.error({
          message: "Failed to get channel video entries",
          error: chunkResult.error,
          context: { channelId: channel.id },
        });

        return Failure(chunkResult.error);
      }

      const chunkResponse = chunkResult.value;

      if (chunkResponse.status === "done") {
        break;
      }

      if (chunkResponse.status === "found") {
        for (const videoEntryResponse of chunkResponse.chunk) {
          const processEntryResult = await this.processVideoEntry(channel.id, videoEntryResponse);

          if (!processEntryResult.ok) {
            return Failure(processEntryResult.error);
          }
        }
      }
    }

    return Success(undefined);
  }

  private async processVideoEntry(
    channelId: string,
    rawEntry: { id: string },
  ): Promise<Result<void, ProcessError>> {
    this.logger.info(`Processing video entry ${rawEntry.id} for channel ${channelId}.`);

    const entryLookupResult = await this.videoEntryRepository.findById(rawEntry.id);

    if (!entryLookupResult.ok) {
      this.logger.error({
        message: "Error looking up video entry",
        error: entryLookupResult.error,
        context: { videoId: rawEntry.id },
      });

      return Failure(entryLookupResult.error);
    }

    const existingEntry = entryLookupResult.value;
    if (existingEntry) {
      this.logger.info(`Video entry (${rawEntry.id}) already exists. Skipping.`);
      return Success(undefined);
    }

    const createEntryResult = await this.videoEntryRepository.create({
      id: rawEntry.id,
      channelId,
    });

    if (!createEntryResult.ok) {
      this.logger.error({
        message: "Error creating video entry",
        error: createEntryResult.error,
        context: { videoId: rawEntry.id },
      });

      return Failure(createEntryResult.error);
    }

    const enqueueResult = await this.videoEntriesQueue.enqueue(rawEntry.id, channelId);

    if (!enqueueResult.ok) {
      this.logger.error({
        message: "Error enqueuing video",
        error: enqueueResult.error,
        context: { videoId: rawEntry.id },
      });

      return Failure(enqueueResult.error);
    }

    return Success(undefined);
  }
}
