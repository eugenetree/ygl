import { injectable } from "inversify";
import { Logger } from "../../../../_common/logger/logger.js";
import { DatabaseError } from "../../../../../db/types.js";
import { Failure, Result, Success } from "../../../../../types/index.js";
import { BaseError } from "../../../../_common/errors.js";
import { YoutubeApiGetVideo } from "../../../../youtube-api/yt-api-get-video.js";
import { ProcessVideoService } from "./process-video.service.js";
import { VideoRepository } from "../../video.repository.js";
import { ChannelVideoHealthRepository } from "../../channel-video-health.repository.js";
import { ChannelVideosHealth, ChannelVideosHealthProps } from "../../channel-videos-health.js";
import { MAX_FAILED_VIDEOS_STREAK } from "../../config.js";
import { CaptionProps } from "../../caption.js";

type Input = {
  entryId: string;
  channelId: string;
}

@injectable()
export class ProcessVideoEntryUseCase {
  constructor(
    private readonly logger: Logger,
    private readonly videoProcessor: ProcessVideoService,
    private readonly videoRepository: VideoRepository,
    private readonly youtubeApiGetVideo: YoutubeApiGetVideo,
    private readonly channelVideosHealthRepository: ChannelVideoHealthRepository,
  ) {
    this.logger.setContext(ProcessVideoEntryUseCase.name);
  }

  public async execute({ entryId, channelId }: Input): Promise<Result<void, BaseError>> {
    const healthRecordResult = await this.channelVideosHealthRepository.getHealthRecord(channelId);
    if (!healthRecordResult.ok) {
      return healthRecordResult;
    }

    const healthRecord = healthRecordResult.value;
    if (healthRecord && healthRecord.failedVideosStreak >= MAX_FAILED_VIDEOS_STREAK) {
      return Failure({
        type: "TOO_MANY_FAILED_VIDEOS",
        context: {
          videoId: entryId,
          channelId,
        }
      });
    }

    const processEntryResult = await this.processEntry(entryId);

    const syncResult = await this.syncChannelHealth({
      channelId,
      current: healthRecord,
      isSuccess: processEntryResult.ok
    });

    if (!syncResult.ok) {
      return syncResult;
    }

    return processEntryResult;
  }

  private async processEntry(
    entryId: string
  ): Promise<Result<void, BaseError>> {
    this.logger.info(`Fetching video ${entryId}.`);

    const videoDtoResult = await this.youtubeApiGetVideo.getVideo(entryId);
    if (!videoDtoResult.ok) {
      this.logger.error({
        error: videoDtoResult.error,
        context: { videoId: entryId },
      });

      return videoDtoResult;
    }

    const videoDto = videoDtoResult.value;
    this.logger.info(`Processing and saving video ${videoDto.id}.`);

    const { video, autoCaptions, manualCaptions } = await this.videoProcessor.process(videoDto);
    // We only store captions when manual captions exist (auto required as companion)
    const captions: CaptionProps[] = [];

    if (manualCaptions?.length) {
      if (!autoCaptions?.length) {
        return Failure({
          type: "UNEXPECTED_STATE",
          context: { videoId: video.id }
        })
      }

      captions.push(...manualCaptions, ...autoCaptions);
    }

    if (autoCaptions?.length && !manualCaptions?.length) {
      this.logger.info(`Video ${video.id} has only auto captions. They won't be saved.`);
    }

    const createVideoResult = await this.videoRepository.createWithCaptions(video, captions);
    if (!createVideoResult.ok) {
      this.logger.error({
        message: `Failed to create video ${video.id} with ${captions.length} captions.`,
        error: createVideoResult.error,
      });
      return createVideoResult;
    }

    this.logger.info(
      `Video ${video.id} persisted. autoCaptions=${autoCaptions?.length ?? 0}, manualCaptions=${manualCaptions?.length ?? 0}.`
    );

    return Success(undefined);
  }

  private async syncChannelHealth({
    channelId,
    current,
    isSuccess
  }: {
    channelId: string;
    current: ChannelVideosHealth | null;
    isSuccess: boolean;
  }): Promise<Result<void, DatabaseError>> {
    const nextData: ChannelVideosHealthProps = {
      channelId,
      succeededVideosStreak: isSuccess ? (current?.succeededVideosStreak ?? 0) + 1 : 0,
      failedVideosStreak: isSuccess ? 0 : (current?.failedVideosStreak ?? 0) + 1,
    };

    return current
      ? await this.channelVideosHealthRepository.update({ ...current, ...nextData })
      : await this.channelVideosHealthRepository.create(nextData);
  }
}


