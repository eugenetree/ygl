export type ChannelVideosScrapeMetadata = {
  id: string;
  processingStatus: "NOT_STARTED" | "IN_PROGRESS" | "SUCCESS" | "FAIL";
  processingStartedAt: Date | null;
  processingCompletedAt: Date | null;
  failReason:
    | "CHANNEL_HAS_NO_VIDEOS"
    | "TOO_MANY_CONSECUTIVE_FAILED_VIDEOS"
    | "LOW_PERCENTAGE_OF_VIDEOS_WITH_VALID_CAPTIONS"
    | null;
  videosWithValidCaptionsCount: number;
  videosWithNoCaptionsCount: number;
  videosWithNotSuitableCaptionsCount: number;
  consecutiveFailedVideosCount: number;
  totalFailedVideosCount: number;
  processedVideosCount: number;
  channelId: string;
  createdAt: Date;
  updatedAt: Date;
};
