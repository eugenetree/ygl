import { injectable } from "inversify";
import { pick } from "lodash-es";

import { Logger } from "../../../../_common/logger/logger.js";
import { CaptionProps } from "../../caption.js";
import { Caption as CaptionDto, Video as VideoDto } from "../../../../youtube-api/youtube-api.types.js";
import { AutoCaptionsStatus, ManualCaptionsStatus, VideoProps } from "../../video.js";
import { ProcessManualCaptionsService } from "./process-manual-captions.service.js";
import { ProcessAutoCaptionsService } from "./process-auto-captions.service.js";
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
    private readonly processManualCaptionsService: ProcessManualCaptionsService,
    private readonly processAutoCaptionsService: ProcessAutoCaptionsService,
    private readonly captionsSimilarityService: CaptionsSimilarityService,
  ) { }

  async process(videoDto: VideoDto): Promise<ProcessResult> {
    const { id: videoId, autoCaptions: autoDto, manualCaptions: manualDto } = videoDto;

    let autoCaptionsStatus: AutoCaptionsStatus = "CAPTIONS_ABSENT";
    let autoCaptions: CaptionProps[] | null = null;
    let processAutoValue: CaptionDto[] | null = null;

    if (autoDto) {
      const result = await this.processAutoCaptionsService.process(autoDto);
      autoCaptionsStatus = result.ok ? "CAPTIONS_VALID" : result.error.type;
      if (result.ok) {
        processAutoValue = result.value;
        autoCaptions = this.captionsToDomain({ videoId, captionsDto: result.value, type: "auto" });
      }
    }

    let manualCaptionsStatus: ManualCaptionsStatus = "CAPTIONS_ABSENT";
    let manualCaptions: CaptionProps[] | null = null;
    let processManualValue: CaptionDto[] | null = null;

    if (manualDto) {
      const result = await this.processManualCaptionsService.process(manualDto);
      manualCaptionsStatus = result.ok ? "CAPTIONS_VALID" : result.error.type;
      if (result.ok) {
        processManualValue = result.value;
        manualCaptions = this.captionsToDomain({ videoId, captionsDto: result.value, type: "manual" });
      }
    }

    let captionsSimilarityScore: number | null = null;
    let captionsShift: number | null = null;

    if (processAutoValue && processManualValue) {
      const similarityResult = await this.captionsSimilarityService.calculateSimilarity({
        autoCaptions: processAutoValue,
        manualCaptions: processManualValue,
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
