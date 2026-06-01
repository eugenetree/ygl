import { injectable } from "inversify";
import type { CaptionTrackState } from "../../../../../youtube-api/youtube-api.types.js";
import { CAPTIONS_PROCESSING_ALGORITHM_VERSION } from "../../config.js";
import type { AutoCaptionsStatus, ManualCaptionsStatus } from "../../video.js";
import type { AutoCaptionsValidator } from "./auto-captions.validator.js";
import type { CaptionSimilarityService } from "./captions-similarity.service.js";
import type { ManualCaptionsValidator } from "./manual-captions.validator.js";

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
  ) {}

  analyze({
    autoCaptions,
    manualCaptions,
  }: {
    autoCaptions: CaptionTrackState;
    manualCaptions: CaptionTrackState;
  }): AnalysisResult {
    const autoCaptionsStatus: AutoCaptionsStatus =
      this.resolveAutoStatus(autoCaptions);
    const manualCaptionsStatus: ManualCaptionsStatus =
      this.resolveManualStatus(manualCaptions);

    if (
      autoCaptions.state === "FETCHED" &&
      manualCaptions.state === "FETCHED"
    ) {
      const similarityResult =
        this.captionsSimilarityService.calculateSimilarity({
          autoCaptions: autoCaptions.data,
          manualCaptions: manualCaptions.data,
        });

      return {
        autoCaptionsStatus,
        manualCaptionsStatus,
        captionsProcessingAlgorithmVersion:
          CAPTIONS_PROCESSING_ALGORITHM_VERSION,
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

  private resolveAutoStatus(track: CaptionTrackState): AutoCaptionsStatus {
    switch (track.state) {
      case "ABSENT":
        return "CAPTIONS_ABSENT";
      case "PRESENT_NOT_FETCHED":
        return "CAPTIONS_NOT_FETCHED";
      case "FETCHED": {
        const result = this.autoCaptionsValidator.validate(track.data);
        return result.ok ? "CAPTIONS_VALID" : result.error.type;
      }
    }
  }

  private resolveManualStatus(track: CaptionTrackState): ManualCaptionsStatus {
    switch (track.state) {
      case "ABSENT":
        return "CAPTIONS_ABSENT";
      case "PRESENT_NOT_FETCHED":
        return "CAPTIONS_NOT_FETCHED";
      case "FETCHED": {
        const result = this.manualCaptionsValidator.validate(track.data);
        return result.ok ? "CAPTIONS_VALID" : result.error.type;
      }
    }
  }
}
