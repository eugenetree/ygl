import { injectable } from "inversify";
import { Failure, Result, Success } from "../../../../types/index.js";
import { Logger } from "../../../_common/logger/logger.js";
import { Channel } from "../../../domain/channel.js";
import { Video as VideoDto } from "../../../youtube-api/youtube-api.types.js";
import { youtubeApiGetChannelVideos } from "../../../youtube-api/yt-api-get-channel-videos.js";
import { ChannelInitialProcessError } from "./channel-initial-scan.service.types.js";
import { ProcessVideoError } from "./channel-initial-scan.service.types.js";
import {
  ChannelProcessingContext,
  ProcessingContext,
} from "./channel-processing-context.js";
import { ProcessVideoService } from "./process-video.service.js";
import { VideoRepository } from "./repositories/video-repository.js";

@injectable()
export class ChannelInitialProcessor {
  private processingContext: ChannelProcessingContext | null = null;

  constructor(
    private readonly logger: Logger,
    private readonly videoRepository: VideoRepository,
    private readonly videoProcessor: ProcessVideoService,
  ) {}

  async process(
    channel: Channel,
  ): Promise<
    Result<{ processingContext: ProcessingContext }, ChannelInitialProcessError>
  > {
    this.processingContext = new ChannelProcessingContext();

    if (channel.videoCount === 0) {
      this.logger.error({
        message: `Channel ${channel.id} has no videos even though it's in the processing step.`,
      });

      return Failure({
        type: "CHANNEL_HAS_NO_VIDEOS",
        channelId: channel.id,
        processingContext: this.processingContext,
      });
    }

    this.processingContext = new ChannelProcessingContext();

    const channelVideosGenerator = youtubeApiGetChannelVideos.getChannelVideos(
      channel.id,
    );

    for await (const videoResult of channelVideosGenerator) {
      if (!videoResult.ok) {
        this.processingContext.trackVideo({
          type: "VIDEO_FAILED_BEFORE_PROCESSING",
          error: videoResult.error,
        });

        this.logger.error({
          message: "Error getting channel videos",
          error: videoResult.error,
          context: { channelId: channel.id },
        })

        continue;
      }

      const videoResponse = videoResult.value;

      if (videoResponse.status === "done") {
        this.logger.info(
          `Channel ${channel.id} has no more videos to process.`,
        );

        break;
      }

      if (videoResponse.status === "found") {
        const processVideoResult = await this.processVideo(videoResponse.video);

        if (!processVideoResult.ok) {
          if (processVideoResult.error.type === "VIDEO_PERSISTING_FAILED") {
            // If something is wrong with persisting, there is no need in processing next videos as
            // most likely something serious has happened.
            return Failure({
              type: "VIDEO_PERSISTING_FAILED",
              channelId: channel.id,
              processingContext: this.processingContext,
              error: processVideoResult.error,
            });
          }

          if (processVideoResult.error.type === "VIDEO_PROCESSING_FAILED") {
            this.processingContext.trackVideo({
              type: "VIDEO_PROCESSING_FAILED",
              videoId: videoResponse.video.id,
              error: processVideoResult.error.error,
            });
          }

          continue;
        }

        this.processingContext.trackVideo({
          type: "VIDEO_VALID",
          videoId: videoResponse.video.id,
        });
      }

      const shouldContinueProcessingResult =
        this.processingContext.shouldContinueProcessing();

      if (!shouldContinueProcessingResult.shouldContinue) {
        return Failure({
          type: shouldContinueProcessingResult.reason,
          channelId: channel.id,
          processingContext: this.processingContext,
        });
      }
    }

    return Success({
      processingContext: this.processingContext.currentContext,
    });
  }

  private async processVideo(
    videoDto: VideoDto,
  ): Promise<Result<void, ProcessVideoError>> {
    const processVideoResult = await this.videoProcessor.process(videoDto);

    if (!processVideoResult.ok) {
      return Failure({
        type: "VIDEO_PROCESSING_FAILED",
        error: processVideoResult.error,
      });
    }

    const { video, captions } = processVideoResult.value;

    const createVideoResult = await this.videoRepository.createWithCaptions(
      video,
      captions,
    );

    if (!createVideoResult.ok) {
      this.logger.error({
        message: `CRITICAL: Failed to create video ${video.id} with ${captions.length} captions.`,
        error: createVideoResult.error,
      });

      return Failure({
        type: "VIDEO_PERSISTING_FAILED",
        error: createVideoResult.error,
      });
    }

    this.logger.info(
      `Video ${video.id} created with ${captions.length} captions.`,
    );

    return Success(undefined);
  }
}
