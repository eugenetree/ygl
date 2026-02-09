import { Logger } from "../../../_common/logger/logger.js";
import { Caption } from "../../../domain/caption.js";

export class ProcessManualCaptionsService {
  constructor(private readonly logger: Logger) { }

  async process(captions: Caption[]) {
    return captions;
  }

  private analyzeCaptions(captions: Caption[]) {
    return captions;
  }
}