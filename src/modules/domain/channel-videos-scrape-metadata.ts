export type ChannelVideosScrapeMetadata = {
  id: string;
  firstVideoId: string | null;
  lastVideoId: string | null;

  processingStatus: "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED" | "FAILED" | "TERMINATED_EARLY";
  processingStartedAt: Date | null;
  processingCompletedAt: Date | null;

  failureReason:
  | "TOO_MANY_CONSECUTIVE_FAILED_VIDEOS"
  | string & {}
  | null;
  terminationReason:
  | "LOW_PERCENTAGE_OF_VIDEOS_WITH_VALID_CAPTIONS"
  | "CHANNEL_HAS_TOO_MANY_VIDEOS"
  | "CHANNEL_HAS_NO_VIDEOS"
  | null;

  videosBothCaptionsValid: number;
  videosNoCaptionsValid: number;
  videosOnlyManualCaptionsValid: number;
  videosOnlyAutoCaptionsValid: number;

  videosAll: number;
  videosSkippedAlreadyProcessed: number;
  videosFailed: number;
  videosProcessed: number;

  channelId: string;
  createdAt: Date;
  updatedAt: Date;
};