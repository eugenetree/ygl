import { injectable } from "inversify";
import { Logger } from "../../../../../_common/logger/logger.js";
import { Failure, Success } from "../../../../../../types/index.js";
import { YoutubeApiGetVideo } from "../../../../../youtube-api/yt-api-get-video.js";
import { VideoMapper } from "./video.mapper.js";
import { VideoRepository } from "../../video.repository.js";
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
    private readonly transcriptionJobsQueue: TranscriptionJobsQueue,
    private readonly captionAnalysisService: CaptionAnalysisService,
  ) {
    this.logger.setContext(ProcessVideoEntryUseCase.name);
  }

  public async execute({ videoId, channelId }: { videoId: string, channelId: string }) {
    this.logger.info(`Processing video entry ${videoId}...`);

    const videoDtoResult = await this.youtubeApiGetVideo.getVideo(videoId);
    if (!videoDtoResult.ok) {
      this.logger.error({
        error: videoDtoResult.error,
        context: { videoId },
      });

      return videoDtoResult;
    }

    const videoDto = videoDtoResult.value;

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
      channelId,
    };

    const autoCaptions: CaptionProps[] = videoDto.autoCaptions.state === "FETCHED"
      ? this.videoMapper.mapDtoToCaptionProps({ videoId: videoDto.id, captionsDto: videoDto.autoCaptions.data, type: "auto" })
      : [];

    const manualCaptions: CaptionProps[] = videoDto.manualCaptions.state === "FETCHED"
      ? this.videoMapper.mapDtoToCaptionProps({ videoId: videoDto.id, captionsDto: videoDto.manualCaptions.data, type: "manual" })
      : [];

    // Invariant: yt-api-get-video downloads both tracks together or neither;
    // any other combination indicates a bug upstream.
    if (
      (manualCaptions?.length && !autoCaptions?.length) ||
      (!manualCaptions?.length && autoCaptions?.length)
    ) {
      return Failure({
        type: "UNEXPECTED_STATE" as const,
        context: { videoId: video.id, manualCaptions, autoCaptions }
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

    // Manual captions exist but we couldn't pair them with auto captions
    // (no *-orig auto track to derive language) — enqueue transcription.
    if (videoDto.manualCaptions.state === "PRESENT_NOT_FETCHED" && videoDto.autoCaptions.state === "ABSENT") {
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

    const hasValidCaptions =
      video.autoCaptionsStatus === "CAPTIONS_VALID" &&
      video.manualCaptionsStatus === "CAPTIONS_VALID";

    return Success({ hasValidCaptions });
  }

}
