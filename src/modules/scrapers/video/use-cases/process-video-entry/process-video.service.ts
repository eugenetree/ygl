import { injectable } from "inversify";
import { pick } from "lodash-es";

import { Logger } from "../../../../_common/logger/logger.js";
import { CaptionProps } from "../../caption.js";
import { Caption as CaptionDto, Video as VideoDto } from "../../../../youtube-api/youtube-api.types.js";
import { AutoCaptionsStatus, ManualCaptionsStatus, VideoProps } from "../../video.js";
import { ManualCaptionsValidator } from "./manual-captions.validator.js";
import { AutoCaptionsValidator } from "./auto-captions.validator.js";
import { CaptionsSimilarityService } from "./captions-similarity.service.js";

type ProcessResult = {
  video: VideoProps;
  autoCaptions: CaptionProps[] | null;
  manualCaptions: CaptionProps[] | null;
};

@injectable()
export class ProcessVideoService {
  constructor(
    private readonly logger: Logger,
    private readonly manualCaptionsValidator: ManualCaptionsValidator,
    private readonly autoCaptionsValidator: AutoCaptionsValidator,
    private readonly captionsSimilarityService: CaptionsSimilarityService,
  ) { }

  async process(videoDto: VideoDto): Promise<ProcessResult> {
    const { id: videoId, autoCaptions: autoDto, manualCaptions: manualDto } = videoDto;

    let autoCaptionsStatus: AutoCaptionsStatus = "CAPTIONS_ABSENT";
    let autoCaptions: CaptionProps[] | null = null;
    let processAutoValue: CaptionDto[] | null = null;

    if (autoDto) {
      const result = this.autoCaptionsValidator.validate(autoDto);
      autoCaptionsStatus = result.ok ? "CAPTIONS_VALID" : result.error.type;
      processAutoValue = autoDto;
      autoCaptions = this.captionsToDomain({ videoId, captionsDto: autoDto, type: "auto" });
    }

    let manualCaptionsStatus: ManualCaptionsStatus = videoDto.captionStatus === "MANUAL_ONLY"
      ? "CAPTIONS_PENDING_VALIDATION"
      : "CAPTIONS_ABSENT";
    let manualCaptions: CaptionProps[] | null = null;
    let processManualValue: CaptionDto[] | null = null;

    if (manualDto) {
      const result = this.manualCaptionsValidator.validate(manualDto);
      manualCaptionsStatus = result.ok ? "CAPTIONS_VALID" : result.error.type;
      processManualValue = manualDto;
      manualCaptions = this.captionsToDomain({ videoId, captionsDto: manualDto, type: "manual" });
    }

    let captionsSimilarityScore: number | null = null;
    let captionsShift: number | null = null;

    if (autoCaptions && manualCaptions) {
      const similarityResult = await this.captionsSimilarityService.calculateSimilarity({
        autoCaptions,
        manualCaptions,
      });

      captionsSimilarityScore = similarityResult.score;
      captionsShift = similarityResult.shiftMs;
    }

    return {
      video: this.videoToDomain({
        videoDto,
        autoCaptionsStatus,
        manualCaptionsStatus,
        captionsSimilarityScore,
        captionsShift,
      }),
      autoCaptions,
      manualCaptions,
    };
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
  }): VideoProps {
    return {
      ...pick(videoDto, [
        "id",
        "title",
        "duration",
        "keywords",
        "channelId",
        "viewCount",
        "thumbnail",
        "languageCode",
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
      autoCaptionsStatus,
      manualCaptionsStatus,
      captionsSimilarityScore,
      captionsShift,
    };
  }

  private captionsToDomain({
    videoId,
    captionsDto,
    type,
  }: {
    videoId: string;
    captionsDto: CaptionDto[];
    type: "auto" | "manual";
  }): CaptionProps[] {
    return captionsDto.map((captionDto) => ({
      ...captionDto,
      videoId,
      type,
    }));
  }
}
