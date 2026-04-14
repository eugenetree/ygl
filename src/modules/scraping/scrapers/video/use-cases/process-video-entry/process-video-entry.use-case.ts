import { injectable } from "inversify";
import { Logger } from "../../../../../_common/logger/logger.js";
import { DatabaseError } from "../../../../../../db/types.js";
import { Failure, Result, Success } from "../../../../../../types/index.js";
import { BaseError } from "../../../../../_common/errors.js";
import { YoutubeApiGetVideo } from "../../../../../youtube-api/yt-api-get-video.js";
import { VideoMapper } from "./video.mapper.js";
import { VideoRepository } from "../../video.repository.js";
import { ChannelVideoHealthRepository } from "../../channel-video-health.repository.js";
import { ChannelVideosHealth, ChannelVideosHealthProps } from "../../channel-videos-health.js";
import { MAX_FAILED_VIDEOS_STREAK } from "../../config.js";
import { CaptionProps } from "../../caption.js";
import { TranscriptionJobsQueue } from "../../transcription-jobs.queue.js";
import { CaptionAnalysisService } from "./caption-analysis.service.js";
import { VideoProps } from "../../video.js";

@injectable()
export class ProcessVideoEntryUseCase {
  constructor(
    private readonly logger: Logger,
    private readonly videoMapper: VideoMapper,
    private readonly videoRepository: VideoRepository,
    private readonly youtubeApiGetVideo: YoutubeApiGetVideo,
    private readonly channelVideosHealthRepository: ChannelVideoHealthRepository,
    private readonly transcriptionJobsQueue: TranscriptionJobsQueue,
    private readonly captionAnalysisService: CaptionAnalysisService,
  ) {
    this.logger.setContext(ProcessVideoEntryUseCase.name);
  }

  public async execute(videoEntry: { id: string; channelId: string }) {
    this.logger.info(`Processing video entry ${videoEntry.id}...`);

    const healthRecordResult = await this.channelVideosHealthRepository.getHealthRecord(videoEntry.channelId);
    if (!healthRecordResult.ok) {
      return healthRecordResult;
    }

    const healthRecord = healthRecordResult.value;
    if (healthRecord && healthRecord.failedVideosStreak >= MAX_FAILED_VIDEOS_STREAK) {
      return Failure({
        type: "TOO_MANY_FAILED_VIDEOS" as const,
        context: {
          videoId: videoEntry.id,
          channelId: videoEntry.channelId,
        }
      });
    }

    const processResult = await this.processVideo(videoEntry.id);

    const isMembersOnly = !processResult.ok && processResult.error.type === "MEMBERS_ONLY_VIDEO";

    const syncResult = await this.syncChannelHealth({
      channelId: videoEntry.channelId,
      current: healthRecord,
      isSuccess: processResult.ok || isMembersOnly,
    });

    if (!syncResult.ok) {
      return syncResult;
    }

    if (processResult.ok) {
      this.logger.info(`Processing video entry ${videoEntry.id} finished`);
    }

    return processResult;
  }

  private async processVideo(videoId: string) {
    this.logger.info(`Fetching video ${videoId}.`);

    const videoDtoResult = await this.youtubeApiGetVideo.getVideo(videoId);
    if (!videoDtoResult.ok) {
      this.logger.error({
        error: videoDtoResult.error,
        context: { videoId },
      });

      return videoDtoResult;
    }

    const videoDto = videoDtoResult.value;
    const { captionStatus } = videoDto;

    this.logger.info(`Processing and saving video ${videoDto.id}.`);

    const captionsAnalysisResult = this.captionAnalysisService.analyze({
      autoCaptions: videoDto.autoCaptions,
      manualCaptions: videoDto.manualCaptions,
    });

    const video: VideoProps = {
      ...captionsAnalysisResult,
      ...this.videoMapper.mapDtoToVideoProps({
        videoDto,
      }),
    };

    const autoCaptions: CaptionProps[] = videoDto.autoCaptions
      ? this.videoMapper.mapDtoToCaptionProps({ videoId: videoDto.id, captionsDto: videoDto.autoCaptions, type: "auto" })
      : [];

    const manualCaptions: CaptionProps[] = videoDto.manualCaptions
      ? this.videoMapper.mapDtoToCaptionProps({ videoId: videoDto.id, captionsDto: videoDto.manualCaptions, type: "manual" })
      : [];

    if (
      (manualCaptions?.length && !autoCaptions?.length) ||
      (!manualCaptions?.length && autoCaptions?.length)
    ) {
      return Failure({
        type: "UNEXPECTED_STATE" as const,
        context: { videoId: video.id }
      })
    }

    const createVideoResult = await this.videoRepository.createWithCaptions({
      video,
      autoCaptions,
      manualCaptions,
    });

    if (!createVideoResult.ok) {
      this.logger.error({
        message: `Failed to create video ${video.id}.`,
        error: createVideoResult.error,
      });
      return createVideoResult;
    }

    if (captionStatus === "MANUAL_ONLY") {
      // video has only some manual captions, but we need to have auto captions as well
      // to derive the video language and understand which manual captions to pick
      const enqueueResult = await this.transcriptionJobsQueue.enqueue(videoDto.id);
      if (!enqueueResult.ok) {
        this.logger.error({
          message: `Failed to enqueue transcription job for video ${videoDto.id}`,
          error: enqueueResult.error,
        });
        return enqueueResult;
      }
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
