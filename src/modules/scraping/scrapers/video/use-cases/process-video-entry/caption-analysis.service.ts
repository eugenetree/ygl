import { injectable } from "inversify";

import { AutoCaptionsStatus, ManualCaptionsStatus } from "../../video.js";
import { ManualCaptionsValidator } from "./manual-captions.validator.js";
import { AutoCaptionsValidator } from "./auto-captions.validator.js";
import { CaptionSimilarityService } from "./captions-similarity.service.js";
import { CAPTIONS_PROCESSING_ALGORITHM_VERSION } from "../../config.js";

type AnalysisResult = {
  autoCaptionsStatus: AutoCaptionsStatus;
  manualCaptionsStatus: ManualCaptionsStatus;
  captionsProcessingAlgorithmVersion: string;
} & (
  | { captionsSimilarityScore: number; captionsShift: number }
  | { captionsSimilarityScore: null; captionsShift: null }
);

export type CaptionSegment = {
  text: string;
  startTime: number;
  endTime: number;
  duration: number;
};

@injectable()
export class CaptionAnalysisService {
  constructor(
    private readonly manualCaptionsValidator: ManualCaptionsValidator,
    private readonly autoCaptionsValidator: AutoCaptionsValidator,
    private readonly captionsSimilarityService: CaptionSimilarityService,
  ) { }

  analyze({
    autoCaptions,
    manualCaptions,
    captionStatus,
  }: {
    autoCaptions: CaptionSegment[] | null;
    manualCaptions: CaptionSegment[] | null;
    captionStatus: "NONE" | "MANUAL_ONLY" | "AUTO_ONLY" | "BOTH";
  }): AnalysisResult {
    let autoCaptionsStatus: AutoCaptionsStatus =
      captionStatus === "AUTO_ONLY" ? "CAPTIONS_NOT_FETCHED" : "CAPTIONS_ABSENT";

    if (autoCaptions) {
      const result = this.autoCaptionsValidator.validate(autoCaptions);
      autoCaptionsStatus = result.ok ? "CAPTIONS_VALID" : result.error.type;
    }

    let manualCaptionsStatus: ManualCaptionsStatus =
      captionStatus === "MANUAL_ONLY" ? "CAPTIONS_NOT_FETCHED" : "CAPTIONS_ABSENT";

    if (manualCaptions) {
      const result = this.manualCaptionsValidator.validate(manualCaptions);
      manualCaptionsStatus = result.ok ? "CAPTIONS_VALID" : result.error.type;
    }

    if (autoCaptions && manualCaptions) {
      const similarityResult = this.captionsSimilarityService.calculateSimilarity({
        autoCaptions,
        manualCaptions,
      });

      return {
        autoCaptionsStatus,
        manualCaptionsStatus,
        captionsProcessingAlgorithmVersion: CAPTIONS_PROCESSING_ALGORITHM_VERSION,
        captionsSimilarityScore: similarityResult.score,
        captionsShift: similarityResult.shiftMs,
      };
    }

    return {
      autoCaptionsStatus,
      manualCaptionsStatus,
      captionsProcessingAlgorithmVersion: CAPTIONS_PROCESSING_ALGORITHM_VERSION,
      captionsSimilarityScore: null,
      captionsShift: null,
    };
  }
}
