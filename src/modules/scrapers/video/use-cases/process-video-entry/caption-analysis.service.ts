import { injectable } from "inversify";

import { CaptionProps } from "../../caption.js";
import { AutoCaptionsStatus, ManualCaptionsStatus } from "../../video.js";
import { ManualCaptionsValidator } from "./manual-captions.validator.js";
import { AutoCaptionsValidator } from "./auto-captions.validator.js";
import { CaptionSimilarityService } from "./captions-similarity.service.js";

type AnalysisResult = {
  autoCaptionsStatus: AutoCaptionsStatus;
  manualCaptionsStatus: ManualCaptionsStatus;
  captionsSimilarityScore: number | null;
  captionsShift: number | null;
};

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

  async analyze({
    autoCaptions,
    manualCaptions,
    manualCaptionsPendingValidation = false,
  }: {
    autoCaptions: CaptionSegment[] | null;
    manualCaptions: CaptionSegment[] | null;
    manualCaptionsPendingValidation?: boolean;
  }): Promise<AnalysisResult> {
    let autoCaptionsStatus: AutoCaptionsStatus = "CAPTIONS_ABSENT";

    if (autoCaptions) {
      const result = this.autoCaptionsValidator.validate(autoCaptions);
      autoCaptionsStatus = result.ok ? "CAPTIONS_VALID" : result.error.type;
    }

    let manualCaptionsStatus: ManualCaptionsStatus = manualCaptionsPendingValidation
      ? "CAPTIONS_PENDING_VALIDATION"
      : "CAPTIONS_ABSENT";

    if (manualCaptions) {
      const result = this.manualCaptionsValidator.validate(manualCaptions);
      manualCaptionsStatus = result.ok ? "CAPTIONS_VALID" : result.error.type;
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
      autoCaptionsStatus,
      manualCaptionsStatus,
      captionsSimilarityScore,
      captionsShift,
    };
  }
}
