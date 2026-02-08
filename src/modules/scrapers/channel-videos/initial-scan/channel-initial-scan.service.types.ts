import { BaseError } from "../../../_common/errors.js";
import {
  Caption as CaptionDto,
  Video as VideoDto,
} from "../../../youtube-api/youtube-api.types.js";
import { ChannelProcessingContext } from "./channel-processing-context.js";
import { VideoProcessError } from "./process-video.service.types.js";

export type VideoDtoWithAtLeastOneCaption =
  | (VideoDto & {
      manualCaptions: CaptionDto[] | null;
      autoCaptions: CaptionDto[];
    })
  | (VideoDto & {
      manualCaptions: null;
      autoCaptions: CaptionDto[];
    })
  | (VideoDto & {
      manualCaptions: CaptionDto[];
      autoCaptions: CaptionDto[];
    });

export type ChannelInitialProcessError =
  | {
      type: "CHANNEL_HAS_NO_VIDEOS";
      channelId: string;
      processingContext: ChannelProcessingContext;
    }
  | {
      type: "TOO_MANY_CONSECUTIVE_FAILED_VIDEOS";
      channelId: string;
      processingContext: ChannelProcessingContext;
    }
  | {
      type: "LOW_PERCENTAGE_OF_VIDEOS_WITH_VALID_CAPTIONS";
      channelId: string;
      processingContext: ChannelProcessingContext;
    }
  | {
      type: "VIDEO_PERSISTING_FAILED";
      channelId: string;
      processingContext: ChannelProcessingContext;
      error: BaseError;
    };

export type ProcessVideoError =
  | {
      type: "VIDEO_PROCESSING_FAILED";
      error: VideoProcessError;
    }
  | {
      type: "VIDEO_PERSISTING_FAILED";
      error: BaseError;
    };
