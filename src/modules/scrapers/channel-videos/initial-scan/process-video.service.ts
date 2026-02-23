import { injectable } from "inversify";
import { pick } from "lodash-es";

import { Failure, Result, Success } from "../../../../types/index.js";
import { Logger } from "../../../_common/logger/logger.js";
import { Caption } from "../../../domain/caption.js";
import { Caption as CaptionDto } from "../../../youtube-api/youtube-api.types.js";
import { CaptionService } from "../../../domain/caption.service.js";
import { AutoCaptionsStatus, ManualCaptionsStatus, Video } from "../../../domain/video.js";
import { Video as VideoDto } from "../../../youtube-api/youtube-api.types.js";
import { VideoService } from "../../../domain/video.service.js";
import { VideoProcessError } from "./process-video.service.types.js";
import { VideoCaptionsAnalyzer } from "./video-captions-analyzer.js";
import { ProcessManualCaptionsService } from "./process-manual-captions.service.js";
import { ProcessAutoCaptionsService } from "./process-auto-captions.service.js";
import { CaptionsSimilarityService } from "./captions-similarity-service.js";

type ProcessResult = {
  video: Video;
  autoCaptions: Caption[] | null;
  manualCaptions: Caption[] | null;
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
    // no captions at all
    if (videoDto.captionStatus === "NONE") {
      return Success({
        video: this.videoToDomain({
          videoDto,
          autoCaptionsStatus: "CAPTIONS_ABSENT",
          manualCaptionsStatus: "CAPTIONS_ABSENT",
        }),
        autoCaptions: null,
        manualCaptions: null,
      });
    }

    // manual captions exist but no auto — schedule for future processing
    if (videoDto.captionStatus === "MANUAL_ONLY") {
      return Success({
        video: this.videoToDomain({
          videoDto,
          autoCaptionsStatus: "CAPTIONS_ABSENT",
          manualCaptionsStatus: "CAPTIONS_PENDING_VALIDATION",
        }),
        autoCaptions: null,
        manualCaptions: null,
      });
    }

    // captionStatus === "AUTO_ONLY" | "BOTH" from here on
    const processAutoResult = await this.processAutoCaptionsService.process(videoDto.autoCaptions);

    const autoCaptionsStatus: AutoCaptionsStatus = processAutoResult.ok
      ? "CAPTIONS_VALID"
      : processAutoResult.error.type;

    const autoCaptions = processAutoResult.ok
      ? this.captionsToDomain({
        videoId: videoDto.id,
        captionsDto: processAutoResult.value,
        type: "auto",
      })
      : null;

    if (videoDto.captionStatus === "AUTO_ONLY") {
      return Success({
        video: this.videoToDomain({
          videoDto,
          autoCaptionsStatus,
          manualCaptionsStatus: "CAPTIONS_ABSENT",
        }),
        autoCaptions,
        manualCaptions: null,
      });
    }

    let manualCaptionsStatus: ManualCaptionsStatus = "CAPTIONS_ABSENT";
    let manualCaptions: Caption[] | null = null;

    let processManualResult = null;

    if (videoDto.manualCaptions) {
      processManualResult = await this.processManualCaptionsService.process(videoDto.manualCaptions);

      manualCaptionsStatus = processManualResult.ok
        ? "CAPTIONS_VALID"
        : processManualResult.error.type;

      manualCaptions = processManualResult.ok
        ? this.captionsToDomain({
          videoId: videoDto.id,
          captionsDto: processManualResult.value,
          type: "manual",
        })
        : null;
    }

    if (processAutoResult.ok && processManualResult?.ok) {
      const similarityResult = await this.captionsSimilarityService.calculateSimilarity({
        autoCaptions: processAutoResult.value,
        manualCaptions: processManualResult.value,
      });

      // if score is below 70% matched tokens, we consider them invalid
      if (similarityResult.score < 0.7) {
        manualCaptionsStatus = "CAPTIONS_LOW_SIMILARITY_WITH_AUTO";
        manualCaptions = null;
      }
    }

    return Success({
      video: this.videoToDomain({
        videoDto,
        autoCaptionsStatus,
        manualCaptionsStatus,
      }),
      autoCaptions,
      manualCaptions,
    });
  }

  private videoToDomain({
    videoDto,
    autoCaptionsStatus,
    manualCaptionsStatus,
  }: {
    videoDto: VideoDto;
    autoCaptionsStatus: AutoCaptionsStatus;
    manualCaptionsStatus: ManualCaptionsStatus;
  }): Video {
    return this.videoService.create({
      ...pick(videoDto, [
        "id",
        "title",
        "duration",
        "keywords",
        "channelId",
        "viewCount",
        "thumbnail",
      ]),
      // if only manual captions exist, we can't infer video language from them
      languageCode: videoDto.captionStatus === "NONE" || videoDto.captionStatus === "MANUAL_ONLY"
        ? null
        : videoDto.languageCode,
      autoCaptionsStatus,
      manualCaptionsStatus,
    });
  }

  private captionsToDomain({
    videoId,
    captionsDto,
    type,
  }: {
    videoId: string;
    captionsDto: CaptionDto[];
    type: "auto" | "manual";
  }) {
    return captionsDto.map((captionDto) =>
      this.captionService.create({ ...captionDto, videoId, type }),
    );
  }
}
