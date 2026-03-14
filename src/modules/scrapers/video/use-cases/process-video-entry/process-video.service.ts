import { injectable } from "inversify";
import { pick } from "lodash-es";

import { Failure, Result, Success } from "../../../../../types/index.js";
import { Logger } from "../../../../_common/logger/logger.js";
import { Caption as CaptionDto } from "../../../../youtube-api/youtube-api.types.js";
import { AutoCaptionsStatus, ManualCaptionsStatus, Video } from "../../video/video.js";
import { Video as VideoDto } from "../../../../youtube-api/youtube-api.types.js";
import { ProcessManualCaptionsService } from "../../captions/process-manual-captions.service.js";
import { ProcessAutoCaptionsService } from "../../captions/process-auto-captions.service.js";
import { CaptionsSimilarityService } from "../../captions/captions-similarity.service.js";
import { Caption } from "../../captions/caption.js";
import { ValidationError } from "../../../../_common/validation/errors.js";

type ProcessResult = {
  video: Video;
  autoCaptions: Caption[] | null;
  manualCaptions: Caption[] | null;
};

@injectable()
export class ProcessVideoService {
  constructor(
    private readonly logger: Logger,
    private readonly processManualCaptionsService: ProcessManualCaptionsService,
    private readonly processAutoCaptionsService: ProcessAutoCaptionsService,
    private readonly captionsSimilarityService: CaptionsSimilarityService,
  ) { }

  async process(
    videoDto: VideoDto,
  ): Promise<Result<ProcessResult, ValidationError>> {
    // no captions at all
    if (videoDto.captionStatus === "NONE") {
      const videoResult = this.videoToDomain({
        videoDto,
        autoCaptionsStatus: "CAPTIONS_ABSENT",
        manualCaptionsStatus: "CAPTIONS_ABSENT",
        captionsSimilarityScore: null,
        captionsShift: null,
      });

      if (!videoResult.ok) return videoResult;

      return Success({
        video: videoResult.value,
        autoCaptions: null,
        manualCaptions: null,
      });
    }

    // manual captions exist but no auto — schedule for future processing
    if (videoDto.captionStatus === "MANUAL_ONLY") {
      const processManualResult = await this.processManualCaptionsService
        .process(videoDto.manualCaptions);

      const manualCaptionsStatus = processManualResult.ok
        ? "CAPTIONS_VALID"
        : processManualResult.error.type;

      const videoResult = this.videoToDomain({
        videoDto,
        autoCaptionsStatus: "CAPTIONS_ABSENT",
        manualCaptionsStatus,
        captionsSimilarityScore: null,
        captionsShift: null,
      });

      if (!videoResult.ok) return videoResult;

      return Success({
        video: videoResult.value,
        autoCaptions: null,
        manualCaptions: null,
      });
    }

    // captionStatus === "AUTO_ONLY" | "BOTH" from here on
    const processAutoResult = await this.processAutoCaptionsService.process(videoDto.autoCaptions);

    const autoCaptionsStatus: AutoCaptionsStatus = processAutoResult.ok
      ? "CAPTIONS_VALID"
      : processAutoResult.error.type;

    const autoCaptionsResult = processAutoResult.ok
      ? this.captionsToDomain({
        videoId: videoDto.id,
        captionsDto: processAutoResult.value,
        type: "auto",
      })
      : Success(null);

    if (!autoCaptionsResult.ok) return autoCaptionsResult;
    const autoCaptions = autoCaptionsResult.value;

    if (videoDto.captionStatus === "AUTO_ONLY") {
      const videoResult = this.videoToDomain({
        videoDto,
        autoCaptionsStatus,
        manualCaptionsStatus: "CAPTIONS_ABSENT",
        captionsSimilarityScore: null,
        captionsShift: null,
      });

      if (!videoResult.ok) return videoResult;

      return Success({
        video: videoResult.value,
        autoCaptions,
        manualCaptions: null,
      });
    }

    let manualCaptionsStatus: ManualCaptionsStatus = "CAPTIONS_ABSENT";
    let manualCaptions: Caption[] | null = null;
    let captionsSimilarityScore: number | null = null;
    let captionsShift: number | null = null;

    let processManualResult = null;

    if (videoDto.manualCaptions) {
      processManualResult = await this.processManualCaptionsService.process(videoDto.manualCaptions);

      manualCaptionsStatus = processManualResult.ok
        ? "CAPTIONS_VALID"
        : processManualResult.error.type;

      if (processManualResult.ok) {
        const manualCaptionsResult = this.captionsToDomain({
          videoId: videoDto.id,
          captionsDto: processManualResult.value,
          type: "manual",
        });

        if (!manualCaptionsResult.ok) return manualCaptionsResult;
        manualCaptions = manualCaptionsResult.value;
      }
    }

    if (processAutoResult.ok && processManualResult?.ok) {
      const similarityResult = await this.captionsSimilarityService.calculateSimilarity({
        autoCaptions: processAutoResult.value,
        manualCaptions: processManualResult.value,
      });

      captionsSimilarityScore = similarityResult.score;
      captionsShift = similarityResult.shiftMs;
    }

    const videoResult = this.videoToDomain({
      videoDto,
      autoCaptionsStatus,
      manualCaptionsStatus,
      captionsSimilarityScore,
      captionsShift,
    });

    if (!videoResult.ok) return videoResult;

    return Success({
      video: videoResult.value,
      autoCaptions,
      manualCaptions,
    });
  }

  private videoToDomain({
    videoDto,
    autoCaptionsStatus,
    manualCaptionsStatus,
    captionsSimilarityScore,
    captionsShift,
  }: {
    videoDto: VideoDto;
    autoCaptionsStatus: AutoCaptionsStatus;
    manualCaptionsStatus: ManualCaptionsStatus;
    captionsSimilarityScore: number | null;
    captionsShift: number | null;
  }): Result<Video, ValidationError> {
    return Video.create({
      ...pick(videoDto, [
        "id",
        "title",
        "duration",
        "keywords",
        "channelId",
        "viewCount",
        "thumbnail",
        "asr",
        "abr",
        "acodec",
        "audioChannels",
        "audioQuality",
        "isDrc",
        "categories",
        "track",
        "artist",
        "album",
        "creator",
        "uploadedAt",
        "description",
        "likeCount",
        "commentCount",
        "availability",
        "playableInEmbed",
        "channelIsVerified",
      ]),
      // if only manual captions exist, we can't infer video language from them
      languageCode: videoDto.captionStatus === "NONE" || videoDto.captionStatus === "MANUAL_ONLY"
        ? null
        : videoDto.languageCode,
      autoCaptionsStatus,
      manualCaptionsStatus,
      captionsSimilarityScore,
      captionsShift,
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
  }): Result<Caption[] | null, ValidationError> {
    const captions: Caption[] = [];
    for (const captionDto of captionsDto) {
      const result = Caption.create({ ...captionDto, videoId, type });
      if (!result.ok) {
        return result;
      }
      captions.push(result.value);
    }
    return Success(captions);
  }
}
