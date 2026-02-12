import { injectable } from "inversify";
import { VideoProcessError } from "./process-video.service.types.js";
import { FetchError } from "../../../_common/http/errors.js";
import { ParsingError, ValidationError } from "../../../_common/validation/errors.js";
import { DatabaseError } from "../../../../db/types.js";

export type ProcessingContext = {
  firstVideoId: string | null;
  lastVideoId: string | null;

  videosBothCaptionsValid: number;
  videosNoCaptionsValid: number;
  videosOnlyManualCaptionsValid: number;
  videosOnlyAutoCaptionsValid: number;

  videosAll: number;
  videosSkippedAlreadyProcessed: number;
  videosFailed: number;
  videosProcessed: number;

  videosFailedInRow: number;
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
  type: "VIDEO_PERSISTING_FAILED",
  videoId: string;
  error: DatabaseError;
} | {
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
    firstVideoId: null,
    lastVideoId: null,
    videosBothCaptionsValid: 0,
    videosNoCaptionsValid: 0,
    videosOnlyManualCaptionsValid: 0,
    videosOnlyAutoCaptionsValid: 0,
    videosAll: 0,
    videosSkippedAlreadyProcessed: 0,
    videosFailed: 0,
    videosProcessed: 0,
    videosFailedInRow: 0,
  };

  public shouldContinueProcessing(): ShouldContinueProcessingResult {
    const { videosFailedInRow } = this.currentContext;

    // If channel has a lot of videos, we should make sure
    // that it has at least 10% of videos with valid captions
    if (
      this.currentContext.videosProcessed > 50 &&
      this.currentContext.videosBothCaptionsValid /
      this.currentContext.videosProcessed <
      0.1
    ) {
      return {
        shouldContinue: false,
        reason: "LOW_PERCENTAGE_OF_VIDEOS_WITH_VALID_CAPTIONS",
        context: this.currentContext,
      }
    }

    if (videosFailedInRow > 5) {
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
    if ("videoId" in params) {
      if (!this.currentContext.firstVideoId) {
        this.currentContext.firstVideoId = params.videoId;
      }

      this.currentContext.lastVideoId = params.videoId;
    }

    this.currentContext.videosAll++;

    if (params.type === "VIDEO_VALID") {
      this.currentContext.videosBothCaptionsValid++;
      this.currentContext.videosProcessed++;
      this.currentContext.videosFailedInRow = 0;
      this.previousVideoStatus = params.type;

      return;
    }

    if (params.type === "VIDEO_PROCESSING_FAILED") {
      if (params.error.type === "NO_CAPTIONS") {
        this.currentContext.videosNoCaptionsValid++;
      }

      if (params.error.type === "NO_VALID_CAPTIONS") {
        this.currentContext.videosSkippedAlreadyProcessed++;
      }

      this.currentContext.videosFailed++;
      this.currentContext.videosProcessed++;
      this.currentContext.videosFailedInRow++;
      this.previousVideoStatus = params.type;

      return;
    }

    if (params.type === "VIDEO_FAILED_BEFORE_PROCESSING") {
      if (this.previousVideoStatus === "VIDEO_FAILED_BEFORE_PROCESSING") {
        this.currentContext.videosFailedInRow++;
      } else {
        this.currentContext.videosFailedInRow = 1;
      }

      this.currentContext.videosFailed++;
      this.previousVideoStatus = params.type;
    }
  }
}
