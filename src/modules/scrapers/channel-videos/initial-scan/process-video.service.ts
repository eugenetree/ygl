import { injectable } from "inversify";
import { pick } from "lodash-es";

import { Failure, Result, Success } from "../../../../types/index.js";
import { Logger } from "../../../_common/logger/logger.js";
import { Caption } from "../../../domain/caption.js";
import { CaptionService } from "../../../domain/caption.service.js";
import { Video } from "../../../domain/video.js";
import { VideoService } from "../../../domain/video.service.js";
import { Video as VideoDto } from "../../../youtube-api/youtube-api.types.js";
import { VideoDtoWithAtLeastOneCaption } from "./channel-initial-scan.service.types.js";
import { VideoProcessError } from "./process-video.service.types.js";
import { VideoCaptionsAnalyzer } from "./video-captions-analyzer.js";
import { ProcessManualCaptionsService } from "./process-manual-captions.service.js";
import { ProcessAutoCaptionsService } from "./process-auto-captions.service.js";

@injectable()
export class ProcessVideoService {
  constructor(
    private readonly logger: Logger,
    private readonly captionService: CaptionService,
    private readonly videoService: VideoService,
    private readonly videoCaptionsAnalyzer: VideoCaptionsAnalyzer,
    private readonly processManualCaptionsService: ProcessManualCaptionsService,
    private readonly processAutoCaptionsService: ProcessAutoCaptionsService,
  ) { }

  async process(
    videoDto: VideoDto,
  ): Promise<Result<{ video: Video; captions: Caption[] }, VideoProcessError>> {
    if (!this.isVideoWithAtLeastOneCaption(videoDto)) {
      this.logger.info(`Video ${videoDto.id} has no captions. Skipping.`);

      return Failure({
        type: "NO_CAPTIONS",
        videoId: videoDto.id,
      });
    }

    let captions: Caption[] = [];
    let captionType: "manual" | "auto" | null = null;

    if (videoDto.manualCaptions) {
      this.processManualCaptionsService.process(videoDto.manualCaptions);
      const manualCaptions = videoDto.manualCaptions.map((captionDto) =>
        this.captionService.create({ ...captionDto, videoId: videoDto.id }),
      );

      const { isCaptionsGood } =
        this.videoCaptionsAnalyzer.analyzeManualCaptions(manualCaptions);

      if (isCaptionsGood) {
        captions = manualCaptions;
        captionType = "manual";
      }
    } else if (videoDto.autoCaptions) {
      const autoCaptions = videoDto.autoCaptions.map((captionDto) =>
        this.captionService.create({ ...captionDto, videoId: videoDto.id }),
      );

      const { isCaptionsGood } =
        this.videoCaptionsAnalyzer.analyzeAutoCaptions();

      if (isCaptionsGood) {
        captions = autoCaptions;
        captionType = "auto";
      }
    }

    if (captionType === null) {
      return Failure({
        type: "NO_VALID_CAPTIONS",
        videoId: videoDto.id,
        captions: {
          manualCaptions: videoDto.manualCaptions,
          autoCaptions: videoDto.autoCaptions,
        },
      });
    }

    const video = this.videoService.create({
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
      // TODO: fix
      hasAutoCaptions: false,
      hasManualCaptions: false,
    });

    return Success({
      video,
      captions,
    });
  }

  private isVideoWithAtLeastOneCaption(
    videoDto: VideoDto,
  ): videoDto is VideoDtoWithAtLeastOneCaption {
    if (!videoDto.manualCaptions && !videoDto.autoCaptions) {
      return false;
    }

    return true;
  }
}
