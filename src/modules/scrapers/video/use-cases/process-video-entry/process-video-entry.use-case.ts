import { injectable } from "inversify";
import { Logger } from "../../../../_common/logger/logger.js";
import { DatabaseError, VideoEntryRow } from "../../../../../db/types.js";
import { Failure, Result, Success } from "../../../../../types/index.js";
import { BaseError } from "../../../../_common/errors.js";
import { YoutubeApiGetVideo } from "../../../../youtube-api/yt-api-get-video.js";
import { ProcessVideoService } from "./process-video.service.js";
import { VideoRepository } from "../../video.repository.js";
import { ChannelVideoHealthRepository } from "../../channel-video-health/channel-video-health.repository.js";
import { ChannelVideosHealth } from "../../channel-video-health/channel-videos-health.js";

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

  public async execute(
    entry: VideoEntryRow
  ): Promise<Result<void, BaseError>> {
    this.logger.info(`Fetching video ${entry.id} via Youtube.`);

    const healthRecordResult = await this.channelVideosHealthRepository.getHealthRecord(entry.channelId);
    if (!healthRecordResult.ok) {
      return healthRecordResult;
    }

    const healthRecord = healthRecordResult.value;
    if (healthRecord && healthRecord.failedVideosStreak >= 5) {
      return Failure({
        type: "TOO_MANY_FAILED_VIDEOS",
        context: {
          videoId: entry.id,
          channelId: entry.channelId,
        }
      });
    }

    const videoDtoResult = await this.youtubeApiGetVideo.getVideo(entry.id);

    if (!videoDtoResult.ok) {
      this.logger.error({
        error: videoDtoResult.error,
        context: { videoId: entry.id },
      });

      await this.syncChannelHealth(entry.channelId, healthRecord, false);
      return videoDtoResult;
    }

    const videoDto = videoDtoResult.value;

    this.logger.info(`Processing and saving video ${videoDto.id} into db.`);

    const processVideoResult = await this.videoProcessor.process(videoDto);

    const { video, autoCaptions, manualCaptions } = processVideoResult;
    const captions = [...(autoCaptions ?? []), ...(manualCaptions ?? [])];

    const createVideoResult = await this.videoRepository.createWithCaptions(
      video,
      captions
    );

    if (!createVideoResult.ok) {
      this.logger.error({
        message: `Failed to create video ${video.id} with ${captions.length} captions.`,
        error: createVideoResult.error,
      });

      await this.syncChannelHealth(entry.channelId, healthRecord, false);
      return createVideoResult;
    }

    this.logger.info(
      `Video ${video.id} persisted. autoCaptions=${autoCaptions?.length ?? 0
      }, manualCaptions=${manualCaptions?.length ?? 0}.`
    );

    await this.syncChannelHealth(entry.channelId, healthRecord, true);

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
    const nextData = {
      channelId,
      succeededVideosStreak: isSuccess ? (current?.succeededVideosStreak ?? 0) + 1 : 0,
      failedVideosStreak: isSuccess ? 0 : (current?.failedVideosStreak ?? 0) + 1,
    };

    return current
      ? await this.channelVideosHealthRepository.update({ ...current, ...nextData })
      : await this.channelVideosHealthRepository.create(nextData);
  }
}


