import { Failure, Result, Success } from "../../../../../types/index.js";
import { Logger } from "../../../../_common/logger/logger.js";
import { CaptionSegment } from "./caption-analysis.service.js";
import { CaptionCleanUpService } from "./caption-clean-up.service.js";
import { injectable } from "inversify";

export type AutoCaptionsValidationError = {
  type: "CAPTIONS_EMPTY"
} | {
  type: "CAPTIONS_TOO_SHORT";
};

const MIN_TOTAL_WORDS = 20;

@injectable()
export class AutoCaptionsValidator {
  constructor(
    private readonly logger: Logger,
    private readonly captionCleanUpService: CaptionCleanUpService,
  ) { }

  validate(captions: CaptionSegment[]): Result<void, AutoCaptionsValidationError> {
    let resultCaptions: CaptionSegment[] = captions;

    if (resultCaptions.length === 0) {
      return Failure({
        type: "CAPTIONS_EMPTY",
      });
    }

    resultCaptions = resultCaptions.map(
      this.captionCleanUpService.normalizeCaption
    );

    const totalWords = resultCaptions.reduce(
      (acc, c) => acc + c.text.split(' ').length,
      0
    );

    if (totalWords < MIN_TOTAL_WORDS) {
      return Failure({
        type: "CAPTIONS_TOO_SHORT",
      });
    }

    return Success(undefined);
  }
}
