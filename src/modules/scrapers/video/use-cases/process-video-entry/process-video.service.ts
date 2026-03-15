import { injectable } from "inversify";
import { pick } from "lodash-es";

import { CaptionProps } from "../../caption.js";
import { Caption as CaptionDto, Video as VideoDto } from "../../../../youtube-api/youtube-api.types.js";
import { AutoCaptionsStatus, ManualCaptionsStatus, VideoProps } from "../../video.js";
import { CAPTIONS_PROCESSING_ALGORITHM_VERSION } from "../../config.js";
import { CaptionAnalysisService } from "./caption-analysis.service.js";

type ProcessResult = {
  video: VideoProps;
  autoCaptions: CaptionProps[] | null;
  manualCaptions: CaptionProps[] | null;
};

@injectable()
export class ProcessVideoService {
  constructor(
    private readonly captionAnalysisService: CaptionAnalysisService,
  ) { }

  async process(videoDto: VideoDto): Promise<ProcessResult> {
    const { id: videoId, autoCaptions: autoDto, manualCaptions: manualDto } = videoDto;

    const analysis = await this.captionAnalysisService.analyze({
      autoCaptions: autoDto,
      manualCaptions: manualDto,
      manualCaptionsPendingValidation: videoDto.captionStatus === "MANUAL_ONLY",
    });

    return {
      video: this.videoToDomain({ videoDto, ...analysis }),
      autoCaptions: autoDto ? this.captionsToDomain({ videoId, captionsDto: autoDto, type: "auto" }) : null,
      manualCaptions: manualDto ? this.captionsToDomain({ videoId, captionsDto: manualDto, type: "manual" }) : null,
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
      captionsProcessingAlgorithmVersion: CAPTIONS_PROCESSING_ALGORITHM_VERSION,
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
