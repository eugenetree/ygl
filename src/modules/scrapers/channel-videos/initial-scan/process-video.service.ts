import { injectable } from "inversify";
import { pick } from "lodash-es";

import { Failure, Result, Success } from "../../../../types/index.js";
import { Logger } from "../../../_common/logger/logger.js";
import { Caption } from "../../../domain/caption.js";
import { Caption as CaptionDto } from "../../../youtube-api/youtube-api.types.js";
import { CaptionService } from "../../../domain/caption.service.js";
import { Video } from "../../../domain/video.js";
import { Video as VideoDto } from "../../../youtube-api/youtube-api.types.js";
import { VideoService } from "../../../domain/video.service.js";
import { VideoDtoWithAtLeastOneCaption } from "./channel-initial-scan.service.types.js";
import { VideoProcessError } from "./process-video.service.types.js";
import { VideoCaptionsAnalyzer } from "./video-captions-analyzer.js";
import { ProcessManualCaptionsService } from "./process-manual-captions.service.js";
import { ProcessAutoCaptionsService } from "./process-auto-captions.service.js";
import { CaptionsSimilarityService } from "./captions-similarity-service.js";

type ProcessResult =
  | {
    video: Video;
    autoCaptions: Caption[];
  }
  | {
    video: Video;
    autoCaptions: Caption[];
    manualCaptions: Caption[];
  };

@injectable()
export class ProcessVideoService {
  constructor(
    private readonly logger: Logger,
    private readonly captionService: CaptionService,
    private readonly videoService: VideoService,
    private readonly videoCaptionsAnalyzer: VideoCaptionsAnalyzer,
    private readonly processManualCaptionsService: ProcessManualCaptionsService,
    private readonly processAutoCaptionsService: ProcessAutoCaptionsService,
    private readonly captionsSimilarityService: CaptionsSimilarityService,
  ) { }

  async process(
    videoDto: VideoDto,
  ): Promise<Result<ProcessResult, VideoProcessError>> {
    const { manualCaptions, autoCaptions } = videoDto;

    if (!autoCaptions && !manualCaptions) {
      return Failure({
        type: "NO_CAPTIONS",
        videoId: videoDto.id,
      });
    }

    if (!autoCaptions && manualCaptions) {
      return Failure({
        type: "NO_AUTO_CAPTIONS_WHEN_MANUAL_PRESENT",
        videoId: videoDto.id,
      })
    }

    const processAutoResult = await this.processAutoCaptionsService.process(autoCaptions!);
    if (!processAutoResult.ok) {
      return Failure({
        type: "INVALID_CAPTIONS_AUTO",
        videoId: videoDto.id,
        cause: processAutoResult.error,
      });
    }

    const processManualResult = await this.processManualCaptionsService.process(manualCaptions!);
    if (!processManualResult.ok) {
      this.logger.info(`No manual captions for video ${videoDto.id}, returning auto captions only`);
      return Success({
        video: this.videoToDomain({
          videoDto,
          hasAutoCaptions: true,
          hasManualCaptions: false,
        }),
        autoCaptions: this.captionsToDomain(
          videoDto.id,
          processAutoResult.value,
        ),
      })
    }

    this.captionsSimilarityService.calculateSimilarity({
      autoCaptions: processAutoResult.value,
      manualCaptions: processManualResult.value,
    });

    return Success({
      video: this.videoToDomain({
        videoDto,
        hasAutoCaptions: true,
        hasManualCaptions: true,
      }),
      autoCaptions: this.captionsToDomain(
        videoDto.id,
        processAutoResult.value,
      ),
      manualCaptions: this.captionsToDomain(
        videoDto.id,
        processManualResult.value,
      ),
    })
  }

  private videoToDomain({
    videoDto,
    hasAutoCaptions,
    hasManualCaptions,
  }: {
    videoDto: Omit<VideoDto, "languageCode"> & { languageCode: NonNullable<VideoDto["languageCode"]> }
    hasAutoCaptions: boolean;
    hasManualCaptions: boolean;
  }) {
    return this.videoService.create({
      ...pick(videoDto, [
        "id",
        "title",
        "duration",
        "keywords",
        "channelId",
        "viewCount",
        "languageCode",
        "thumbnail",
      ]),
      hasAutoCaptions,
      hasManualCaptions,
    });
  }

  private captionsToDomain(videoId: string, captionsDto: CaptionDto[]) {
    return captionsDto.map((captionDto) =>
      this.captionService.create({ ...captionDto, videoId }),
    );
  }
}
