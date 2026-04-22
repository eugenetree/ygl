import { injectable } from "inversify";
import { Logger } from "../../../../../_common/logger/logger.js";
import { Result, Success } from "../../../../../../types/index.js";
import { BaseError } from "../../../../../_common/errors.js";
import { VideoRepository } from "../../video.repository.js";
import { CAPTIONS_PROCESSING_ALGORITHM_VERSION } from "../../config.js";
import { CaptionAnalysisService } from "../process-video-entry/caption-analysis.service.js";

export type ReprocessCaptionsResult = {
  processedCount: number;
  failedCount: number;
  bothValidBefore: number;
  bothValidAfter: number;
  becameValid: string[];
  becameInvalid: string[];
};

@injectable()
export class ReprocessCaptionsUseCase {
  constructor(
    private readonly logger: Logger,
    private readonly videoRepository: VideoRepository,
    private readonly captionAnalysisService: CaptionAnalysisService,
  ) {
    this.logger.setContext(ReprocessCaptionsUseCase.name);
  }

  async execute(): Promise<Result<ReprocessCaptionsResult, BaseError>> {
    this.logger.info(`Starting captions reprocessing to version ${CAPTIONS_PROCESSING_ALGORITHM_VERSION}.`);

    let processedCount = 0;
    let failedCount = 0;
    let bothValidBefore = 0;
    let bothValidAfter = 0;
    const becameValid: string[] = [];
    const becameInvalid: string[] = [];

    for await (const result of this.videoRepository.getVideosForReprocessing()) {
      if (!result.ok) {
        this.logger.error({
          message: "Failed to fetch next video for reprocessing.",
          error: result.error,
        });
        return result;
      }

      const { video, autoCaptions, manualCaptions } = result.value;

      const wasBothValid =
        video.autoCaptionsStatus === "CAPTIONS_VALID" &&
        video.manualCaptionsStatus === "CAPTIONS_VALID";

      const analysis = await this.captionAnalysisService.analyze({
        autoCaptions,
        manualCaptions,
        captionStatus: "BOTH",
      });

      const isBothValid =
        analysis.autoCaptionsStatus === "CAPTIONS_VALID" &&
        analysis.manualCaptionsStatus === "CAPTIONS_VALID";

      if (wasBothValid) bothValidBefore++;
      if (isBothValid) bothValidAfter++;

      const updateResult = await this.videoRepository.update(video.id, {
        ...analysis,
        captionsProcessingAlgorithmVersion: CAPTIONS_PROCESSING_ALGORITHM_VERSION,
      });

      if (!updateResult.ok) {
        this.logger.error({
          message: `Failed to update video ${video.id}.`,
          error: updateResult.error,
        });
        failedCount++;
        continue;
      }

      if (!wasBothValid && isBothValid) becameValid.push(video.id);
      if (wasBothValid && !isBothValid) becameInvalid.push(video.id);

      processedCount++;
    }

    this.logger.info(
      `Reprocessing complete. Processed: ${processedCount}, failed: ${failedCount}. Both CAPTIONS_VALID — before: ${bothValidBefore}, after: ${bothValidAfter}. Became valid: ${becameValid.length}, became invalid: ${becameInvalid.length}.`,
    );

    return Success({
      processedCount,
      failedCount,
      bothValidBefore,
      bothValidAfter,
      becameValid,
      becameInvalid,
    });
  }
}
