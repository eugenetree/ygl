import { injectable } from "inversify";
import { pick } from "lodash-es";

import { ProcessingContext } from "../scrapers/_legacy/channel-processing-context.js";
import { ChannelVideosScrapeMetadata } from "./channel-videos-scrape-metadata.js";

@injectable()
export class ChannelVideosScrapeMetadataService {
  create({ channelId }: { channelId: string }): ChannelVideosScrapeMetadata {
    const now = new Date();

    return {
      id: crypto.randomUUID(),
      channelId,
      firstVideoId: null,
      lastVideoId: null,
      processingStatus: "NOT_STARTED",
      processingStartedAt: null,
      processingCompletedAt: null,
      failureReason: null,
      terminationReason: null,
      videosBothCaptionsValid: 0,
      videosNoCaptionsValid: 0,
      videosOnlyManualCaptionsValid: 0,
      videosOnlyAutoCaptionsValid: 0,
      videosAll: 0,
      videosSkippedAlreadyProcessed: 0,
      videosFailed: 0,
      videosProcessed: 0,
      createdAt: now,
      updatedAt: now,
    };
  }

  markAsInProgress({
    videosScrapeMetadata,
  }: {
    videosScrapeMetadata: ChannelVideosScrapeMetadata;
  }): ChannelVideosScrapeMetadata {
    const now = new Date();

    return {
      ...videosScrapeMetadata,
      processingStatus: "IN_PROGRESS",
      processingStartedAt: now,
      updatedAt: now,
    };
  }

  markAsFailed({
    videosScrapeMetadata,
    processingContext,
    failureReason,
    terminationReason,
    processingStatus = "FAILED",
  }: {
    videosScrapeMetadata: ChannelVideosScrapeMetadata;
    processingContext: ProcessingContext;
    failureReason?: ChannelVideosScrapeMetadata["failureReason"];
    terminationReason?: ChannelVideosScrapeMetadata["terminationReason"];
    processingStatus?: "FAILED" | "TERMINATED_EARLY";
  }): ChannelVideosScrapeMetadata {
    const now = new Date();

    return {
      ...videosScrapeMetadata,
      ...pick(processingContext, [
        "firstVideoId",
        "lastVideoId",
        "videosBothCaptionsValid",
        "videosNoCaptionsValid",
        "videosOnlyManualCaptionsValid",
        "videosOnlyAutoCaptionsValid",
        "videosAll",
        "videosSkippedAlreadyProcessed",
        "videosFailed",
        "videosProcessed",
      ]),
      processingStatus,
      failureReason: failureReason ?? null,
      terminationReason: terminationReason ?? null,
      processingCompletedAt: now,
      updatedAt: now,
    };
  }

  markAsCompleted({
    videosScrapeMetadata,
    processingContext,
  }: {
    videosScrapeMetadata: ChannelVideosScrapeMetadata;
    processingContext: ProcessingContext;
  }): ChannelVideosScrapeMetadata {
    const now = new Date();

    return {
      ...videosScrapeMetadata,
      ...pick(processingContext, [
        "firstVideoId",
        "lastVideoId",
        "videosBothCaptionsValid",
        "videosNoCaptionsValid",
        "videosOnlyManualCaptionsValid",
        "videosOnlyAutoCaptionsValid",
        "videosAll",
        "videosSkippedAlreadyProcessed",
        "videosFailed",
        "videosProcessed",
      ]),
      processingStatus: "COMPLETED",
      failureReason: null,
      terminationReason: null,
      processingCompletedAt: now,
      updatedAt: now,
    };
  }
}
