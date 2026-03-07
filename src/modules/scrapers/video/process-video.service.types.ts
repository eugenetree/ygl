import { Caption } from "../../youtube-api/youtube-api.types.js";
import { ProcessAutoCaptionsError } from "./process-auto-captions.service.js";
import { ProcessManualCaptionsError } from "./process-manual-captions.service.js";

export type VideoProcessError =
  | {
    type: "NO_CAPTIONS";
    videoId: string;
  }
  | {
    type: "NO_AUTO_CAPTIONS_WHEN_MANUAL_PRESENT";
    videoId: string;
  }
  | {
    type: "INVALID_CAPTIONS_AUTO";
    videoId: string;
    cause: ProcessAutoCaptionsError;
  }
  | {
    type: "INVALID_CAPTIONS_MANUAL";
    videoId: string;
    cause: ProcessManualCaptionsError;
  };