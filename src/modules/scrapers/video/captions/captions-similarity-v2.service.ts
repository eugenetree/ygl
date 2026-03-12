import { injectable } from "inversify";
import { Caption } from "../../../youtube-api/youtube-api.types.js";
import { Logger } from "../../../_common/logger/logger.js";
import { CaptionsSimilarityService } from "./captions-similarity.service.js";
import { CaptionCleanUpService } from "./caption-clean-up.service.js";

type TokenOccurrence = {
  token: string;
  startTime: number;
  endTime: number;
};

@injectable()
export class CaptionsSimilarityV2Service extends CaptionsSimilarityService {
  constructor(logger: Logger, captionCleanUpService: CaptionCleanUpService) {
    super(logger, captionCleanUpService);
  }

  /**
   * Calculates similarity using raw YouTube TimedText JSON format for auto captions.
   */
  async calculateSimilarityV2({
    manualCaptions,
    autoCaptionsRaw,
  }: {
    manualCaptions: Caption[];
    autoCaptionsRaw: any;
  }) {
    const autoCaptions = this.parseRawAutoCaptions(autoCaptionsRaw);
    return this.calculateSimilarity({
      manualCaptions,
      autoCaptions,
    });
  }

  /**
   * Parses YouTube's TimedText "srv3" JSON format into standard Caption objects.
   * This format provides word-level timing via 'segs'.
   */
  private parseRawAutoCaptions(raw: any): Caption[] {
    const captions: Caption[] = [];
    const events = raw.events || [];

    for (const event of events) {
      if (!event.segs) continue;

      const eventStart = event.tStartMs || 0;
      const eventDuration = event.dDurationMs || 0;

      for (let i = 0; i < event.segs.length; i++) {
        const seg = event.segs[i];
        const text = (seg.utf8 || "").trim();
        if (!text) continue;

        const startTime = eventStart + (seg.tOffsetMs || 0);

        // Estimating end time: either the next segment's start or event end
        let endTime;
        if (i < event.segs.length - 1 && event.segs[i + 1].tOffsetMs !== undefined) {
          endTime = eventStart + event.segs[i + 1].tOffsetMs;
        } else {
          endTime = eventStart + eventDuration;
        }

        captions.push({
          startTime,
          endTime,
          duration: endTime - startTime,
          text,
        });
      }
    }

    return captions;
  }
}
