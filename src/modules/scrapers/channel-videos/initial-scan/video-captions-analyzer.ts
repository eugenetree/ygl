import { injectable } from "inversify";
import { Logger } from "../../../_common/logger/logger.js";
import { Caption } from "../../../domain/caption.js";

type PickBetterCaptionsParams =
  | {
    manualCaptions: Caption[] | null;
    autoCaptions: Caption[];
  }
  | {
    manualCaptions: Caption[];
    autoCaptions: Caption[] | null;
  }
  | {
    manualCaptions: Caption[];
    autoCaptions: Caption[];
  };

type PickBetterCaptionsResult = {
  captions: Caption[];
  captionType: "manual" | "auto";
} | null;

@injectable()
export class VideoCaptionsAnalyzer {
  constructor(private readonly logger: Logger) { }

  pickBetterCaptions({
    manualCaptions,
    autoCaptions,
  }: PickBetterCaptionsParams): PickBetterCaptionsResult {
    if (manualCaptions && this.analyzeManualCaptions(manualCaptions).isCaptionsGood) {
      return {
        captions: manualCaptions,
        captionType: "manual",
      };
    }

    if (autoCaptions && this.analyzeAutoCaptions().isCaptionsGood) {
      return {
        captions: autoCaptions,
        captionType: "auto",
      };
    }

    return null;
  }

  analyzeManualCaptions(captions: Caption[]) {


    return {
      isCaptionsGood: true,
      qualityIndex: 1,
    };
  }

  analyzeAutoCaptions() {
    return {
      isCaptionsGood: true,
      qualityIndex: 1,
    };
  }
}
