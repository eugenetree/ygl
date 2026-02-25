import { injectable } from "inversify";
import { VideoProcessError } from "../video-entries/process-video.service.types.js";
import { FetchError } from "../../_common/http/errors.js";
import { ParsingError, ValidationError } from "../../_common/validation/errors.js";
import { DatabaseError } from "../../../db/types.js";
import { AutoCaptionsStatus, ManualCaptionsStatus } from "../../domain/video.js";

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
  videoHistory: TrackVideoParams[];
}

export type TrackVideoParams = {
  type: "VIDEO_PERSISTING_FAILED",
  videoId: string;
  error: DatabaseError;
} | {
  type: "VIDEO_PROCESSED",
  videoId: string;
  autoCaptionsStatus: AutoCaptionsStatus;
  manualCaptionsStatus: ManualCaptionsStatus;
} | {
  type: "VIDEO_FAILED_BEFORE_PROCESSING",
  error: FetchError | ParsingError | ValidationError;
} | {
  type: "VIDEO_PROCESSING_FAILED",
  videoId: string;
  error: VideoProcessError,
}

type ShouldContinueProcessingResult = {
  shouldContinue: true;
  context: ProcessingContext;
} | {
  shouldContinue: false;
  reason: "TOO_MANY_CONSECUTIVE_FAILED_VIDEOS" | "LOW_PERCENTAGE_OF_VIDEOS_WITH_VALID_CAPTIONS";
  context: ProcessingContext;
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
    videoHistory: [],
  };

  public shouldContinueProcessing(): ShouldContinueProcessingResult {
    const { videosFailedInRow } = this.currentContext;

    // If channel has a lot of videos, we should make sure
    // that it has at least 10% of videos with valid captions in the last 100
    if (this.currentContext.videoHistory.length >= 100) {
      const validInLast100 = this.currentContext.videoHistory.filter(
        (v) =>
          v.type === "VIDEO_PROCESSED" &&
          v.autoCaptionsStatus === "CAPTIONS_VALID" &&
          v.manualCaptionsStatus === "CAPTIONS_VALID",
      ).length;

      if (validInLast100 < 10) {
        return {
          shouldContinue: false,
          reason: "LOW_PERCENTAGE_OF_VIDEOS_WITH_VALID_CAPTIONS",
          context: this.currentContext,
        };
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
    this.currentContext.videoHistory.push(params);
    if (this.currentContext.videoHistory.length > 100) {
      this.currentContext.videoHistory.shift();
    }

    if ("videoId" in params) {
      if (!this.currentContext.firstVideoId) {
        this.currentContext.firstVideoId = params.videoId;
      }

      this.currentContext.lastVideoId = params.videoId;
    }

    this.currentContext.videosAll++;

    if (params.type === "VIDEO_PROCESSED") {
      const autoValid = params.autoCaptionsStatus === "CAPTIONS_VALID";
      const manualValid = params.manualCaptionsStatus === "CAPTIONS_VALID";

      if (autoValid && manualValid) {
        this.currentContext.videosBothCaptionsValid++;
      } else if (autoValid && !manualValid) {
        this.currentContext.videosOnlyAutoCaptionsValid++;
      } else if (!autoValid && manualValid) {
        this.currentContext.videosOnlyManualCaptionsValid++;
      } else {
        this.currentContext.videosNoCaptionsValid++;
      }

      this.currentContext.videosProcessed++;

      if (autoValid || manualValid) {
        this.currentContext.videosFailedInRow = 0;
      } else {
        this.currentContext.videosFailed++;
        this.currentContext.videosFailedInRow++;
      }

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
