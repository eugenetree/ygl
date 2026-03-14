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

    const healthRecordResult = await this.getHealthRecord(entry.channelId);
    if (!healthRecordResult.ok) {
      return healthRecordResult;
    }

    const videoDtoResult = await this.youtubeApiGetVideo.getVideo(entry.id);

    if (!videoDtoResult.ok) {
      this.logger.error({
        error: videoDtoResult.error,
        context: { videoId: entry.id },
      });

      return this.handleUseCaseFailure({
        error: videoDtoResult.error,
        healthRecord: healthRecordResult.value
      })
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

      return this.handleUseCaseFailure({
        error: createVideoResult.error,
        healthRecord: healthRecordResult.value
      });
    }

    this.logger.info(
      `Video ${video.id} persisted. autoCaptions=${autoCaptions?.length ?? 0
      }, manualCaptions=${manualCaptions?.length ?? 0}.`
    );

    return this.handleUseCaseSuccess({
      healthRecord: healthRecordResult.value
    });
  }

  private async getHealthRecord(channelId: string): Promise<Result<ChannelVideosHealth, DatabaseError>> {
    const channelVideosHealthRecordResult =
      await this.channelVideosHealthRepository.getHealthRecord(channelId);

    if (!channelVideosHealthRecordResult.ok) {
      return channelVideosHealthRecordResult;
    }

    const channelVideosHealthRecord =
      channelVideosHealthRecordResult.value ?? {
        id: crypto.randomUUID(),
        channelId,
        succeededVideosStreak: 0,
        failedVideosStreak: 0,
      };

    return Success(channelVideosHealthRecord);
  }

  private async handleUseCaseSuccess({
    healthRecord
  }: {
    healthRecord: ChannelVideosHealth
  }) {
    healthRecord.succeededVideosStreak += 1;
    healthRecord.failedVideosStreak = 0;
    const healthRecordSaveResult = await this.channelVideosHealthRepository.save(healthRecord);
    return healthRecordSaveResult.ok ? Success(undefined) : healthRecordSaveResult;
  }

  private async handleUseCaseFailure<T>({
    error,
    healthRecord
  }: {
    error: T,
    healthRecord: ChannelVideosHealth
  }) {
    const healthRecordSaveResult = await this.channelVideosHealthRepository.save({
      ...healthRecord,
      failedVideosStreak: healthRecord.failedVideosStreak + 1,
      succeededVideosStreak: 0,
    });

    return healthRecordSaveResult.ok ? Failure(error) : healthRecordSaveResult;
  }
}
