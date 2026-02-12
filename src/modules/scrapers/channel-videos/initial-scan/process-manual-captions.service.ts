import { injectable } from "inversify";
import { Logger } from "../../../_common/logger/logger.js";
import { Caption } from "../../../youtube-api/youtube-api.types.js";
import { Failure, Result, Success } from "../../../../types/index.js";
import { CaptionCleanUpService } from "./caption-clean-up.service.js";

type ProcessManualCaptionsError =
  | { type: "CAPTIONS_EMPTY"; }
  | { type: "CAPTIONS_TOO_SHORT"; }
  | { type: "CAPTIONS_HAS_OVERLAPPING_TIMESTAMPS"; };

const MIN_TOTAL_WORDS = 20;

@injectable()
export class ProcessManualCaptionsService {
  constructor(
    private readonly logger: Logger,
    private readonly captionCleanUpService: CaptionCleanUpService,
  ) { }

  async process(captions: Caption[]): Promise<Result<Caption[], ProcessManualCaptionsError>> {
    if (this.hasOverlappingTimestamps(captions)) {
      return Failure({
        type: "CAPTIONS_HAS_OVERLAPPING_TIMESTAMPS",
      });
    }

    let resultCaptions: Caption[] = [];

    // Normalize individual captions (remove noise, but keep all captions)
    resultCaptions = resultCaptions.map(caption => this.captionCleanUpService.normalizeCaption(caption));

    // Merge short segments into longer ones (15 words, 5 seconds)
    resultCaptions = this.captionCleanUpService.mergeShortCaptions(resultCaptions);

    // Filter out empty/meaningless captions after merging
    resultCaptions = resultCaptions.filter(caption => this.captionCleanUpService.shouldKeepCaption(caption));

    if (resultCaptions.length === 0) {
      return Failure({
        type: "CAPTIONS_EMPTY",
      });
    }

    if (resultCaptions.length < MIN_TOTAL_WORDS) {
      return Failure({
        type: "CAPTIONS_TOO_SHORT",
      });
    }

    return Success(resultCaptions);
  }

  private hasOverlappingTimestamps(captions: Caption[]): boolean {
    for (let i = 0; i < captions.length; i++) {
      const currentCaption = captions[i];
      const nextCaption = captions[i + 1];

      if (nextCaption && currentCaption.endTime > nextCaption.startTime) {
        return true;
      }
    }
    return false;
  }
}