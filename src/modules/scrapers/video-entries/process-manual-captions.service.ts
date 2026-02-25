import { injectable } from "inversify";
import { Logger } from "../../_common/logger/logger.js";
import { Caption } from "../../youtube-api/youtube-api.types.js";
import { Failure, Result, Success } from "../../../types/index.js";
import { CaptionCleanUpService } from "./caption-clean-up.service.js";

export type ProcessManualCaptionsError =
  | { type: "CAPTIONS_EMPTY"; }
  | { type: "CAPTIONS_TOO_SHORT"; }
  | { type: "CAPTIONS_HAS_OVERLAPPING_TIMESTAMPS"; }
  | { type: "CAPTIONS_MOSTLY_UPPERCASE"; };

const MIN_CAPTION_SEGMENTS = 10;

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

    let resultCaptions: Caption[] = captions;

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

    if (resultCaptions.length < MIN_CAPTION_SEGMENTS) {
      return Failure({
        type: "CAPTIONS_TOO_SHORT",
      });
    }

    if (this.isMostlyUppercase(resultCaptions)) {
      return Failure({
        type: "CAPTIONS_MOSTLY_UPPERCASE",
      });
    }

    return Success(resultCaptions);
  }

  // This is still under review
  // Valid manual captions can also be overlapping
  // But we have to see how often that's the case
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

  // This usually happens to captions coming from TV
  // We want to skip such videos
  private isMostlyUppercase(captions: Caption[]): boolean {
    const uppercaseSegments = captions.filter(caption => {
      // strip all non-alphabetic characters
      const letters = caption.text.replace(/[^a-zA-Z]/g, "");
      if (letters.length === 0) return false;
      // strip all non-uppercase characters
      const upperLetters = letters.replace(/[^A-Z]/g, "");
      return upperLetters.length / letters.length > .9;
    });

    return uppercaseSegments.length / captions.length > .9;
  }
}