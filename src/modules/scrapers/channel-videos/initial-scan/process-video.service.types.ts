import { Caption } from "../../../youtube-api/youtube-api.types.js";

export type VideoProcessError =
  | {
    type: "NO_CAPTIONS";
    videoId: string;
  }
  | {
    type: "NO_VALID_CAPTIONS";
    videoId: string;
    captions: {
      manualCaptions: Caption[] | null;
      autoCaptions: Caption[] | null;
    };
  };