import { injectable } from "inversify";
import { pick } from "lodash-es";

import { Failure, Result, Success } from "../../../types/index.js";
import { Logger } from "../../_common/logger/logger.js";
import { Caption } from "../../domain/caption.js";
import { Caption as CaptionDto } from "../../youtube-api/youtube-api.types.js";
import { CaptionService } from "../../domain/caption.service.js";
import { AutoCaptionsStatus, ManualCaptionsStatus, Video } from "../../domain/video.js";
import { Video as VideoDto } from "../../youtube-api/youtube-api.types.js";
import { VideoService } from "../../domain/video.service.js";
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
    private readonly processManualCaptionsService: ProcessManualCaptionsService,
    private readonly processAutoCaptionsService: ProcessAutoCaptionsService,
    private readonly captionsSimilarityService: CaptionsSimilarityService,
  ) { }

  async process(
    videoDto: VideoDto,
  ): Promise<Result<ProcessResult, void>> {
    // no captions at all
    if (videoDto.captionStatus === "NONE") {
      return Success({
        video: this.videoToDomain({
          videoDto,
          autoCaptionsStatus: "CAPTIONS_ABSENT",
          manualCaptionsStatus: "CAPTIONS_ABSENT",
          captionsSimilarityScore: null,
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
          captionsSimilarityScore: null,
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
          captionsSimilarityScore: null,
        }),
        autoCaptions,
        manualCaptions: null,
      });
    }

    let manualCaptionsStatus: ManualCaptionsStatus = "CAPTIONS_ABSENT";
    let manualCaptions: Caption[] | null = null;
    let captionsSimilarityScore: number | null = null;

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

      captionsSimilarityScore = similarityResult.score;
    }

    return Success({
      video: this.videoToDomain({
        videoDto,
        autoCaptionsStatus,
        manualCaptionsStatus,
        captionsSimilarityScore,
      }),
      autoCaptions,
      manualCaptions,
    });
  }

  private videoToDomain({
    videoDto,
    autoCaptionsStatus,
    manualCaptionsStatus,
    captionsSimilarityScore,
  }: {
    videoDto: VideoDto;
    autoCaptionsStatus: AutoCaptionsStatus;
    manualCaptionsStatus: ManualCaptionsStatus;
    captionsSimilarityScore: number | null;
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
      captionsSimilarityScore,
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
