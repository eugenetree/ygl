import { injectable } from "inversify";
import { VideoProcessError } from "./process-video.service.types.js";
import { FetchError } from "../../../_common/http/errors.js";
import { ParsingError, ValidationError } from "../../../_common/validation/errors.js";

export type ProcessingContext = {
  videosWithValidCaptionsCount: number;
  videosWithNoCaptionsCount: number;
  videosWithNotSuitableCaptionsCount: number;
  consecutiveFailedVideosCount: number;
  totalFailedVideosCount: number;
  processedVideosCount: number;
}

type ShouldContinueProcessingResult = {
  shouldContinue: true;
  context: ProcessingContext;
} | {
  shouldContinue: false;
  reason: "TOO_MANY_CONSECUTIVE_FAILED_VIDEOS" | "LOW_PERCENTAGE_OF_VIDEOS_WITH_VALID_CAPTIONS";
  context: ProcessingContext;
}


type TrackVideoParams = {
  type: "VIDEO_VALID",
  videoId: string;
} | {
  type: "VIDEO_FAILED_BEFORE_PROCESSING",
  error: FetchError | ParsingError | ValidationError;
} | {
  type: "VIDEO_PROCESSING_FAILED",
  videoId: string;
  error: VideoProcessError,
}

@injectable()
export class ChannelProcessingContext {
  private previousVideoStatus: TrackVideoParams["type"] | null = null;

  public readonly currentContext: ProcessingContext = {
    videosWithValidCaptionsCount: 0,
    videosWithNoCaptionsCount: 0,
    videosWithNotSuitableCaptionsCount: 0,
    consecutiveFailedVideosCount: 0,
    totalFailedVideosCount: 0,
    processedVideosCount: 0,
  };

  public shouldContinueProcessing(): ShouldContinueProcessingResult {
    const { 
      consecutiveFailedVideosCount,
    } = this.currentContext;

    // If channel has a lot of videos, we should make sure
    // that it has at least 10% of videos with valid captions
    if (
      this.currentContext.processedVideosCount > 50 &&
      this.currentContext.videosWithValidCaptionsCount /
        this.currentContext.processedVideosCount <
        0.1
    ) {
      return {
        shouldContinue: false,
        reason: "LOW_PERCENTAGE_OF_VIDEOS_WITH_VALID_CAPTIONS",
        context: this.currentContext,
      }
    }

    if (consecutiveFailedVideosCount > 5) {
      return {
        shouldContinue: false,
        reason: "TOO_MANY_CONSECUTIVE_FAILED_VIDEOS",
        context: this.currentContext,
      }
    }

    return {
      shouldContinue: true,
      context: this.currentContext,
    }
  }

  public trackVideo(params: TrackVideoParams) {
    if (params.type === "VIDEO_VALID") {
      this.currentContext.videosWithValidCaptionsCount++;
      this.previousVideoStatus = params.type;
      
      return;
    }

    if (params.type === "VIDEO_PROCESSING_FAILED") {
      if (params.error.type === "NO_CAPTIONS") {
        this.currentContext.videosWithNoCaptionsCount++;
      }

      if (params.error.type === "NO_VALID_CAPTIONS") {
        this.currentContext.videosWithNotSuitableCaptionsCount++;
      }

      return;
    }

    if (params.type === "VIDEO_FAILED_BEFORE_PROCESSING") {
      this.currentContext.totalFailedVideosCount++;
      this.previousVideoStatus = params.type;

      if (this.previousVideoStatus === "VIDEO_FAILED_BEFORE_PROCESSING") {
        this.currentContext.consecutiveFailedVideosCount++;
      }
    }

    this.currentContext.processedVideosCount++;
  }
}
