import { injectable } from "inversify";
import { Caption } from "../../../youtube-api/youtube-api.types.js";
import { Logger } from "../../../_common/logger/logger.js";

@injectable()
export class CaptionsSimilarityService {
  constructor(private readonly logger: Logger) { }

  async calculateSimilarity({
    manualCaptions,
    autoCaptions,
  }: {
    manualCaptions: Caption[];
    autoCaptions: Caption[];
  }): Promise<number> {
    return 0;
  }
}