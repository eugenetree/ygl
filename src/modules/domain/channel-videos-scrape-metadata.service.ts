import { injectable } from "inversify";
import { pick } from "lodash-es";

import { ProcessingContext } from "../scrapers/channel-videos/initial-scan/channel-processing-context.js";
import { ChannelVideosScrapeMetadata } from "./channel-videos-scrape-metadata.js";

@injectable()
export class ChannelVideosScrapeMetadataService {
  create({ channelId }: { channelId: string }): ChannelVideosScrapeMetadata {
    return {
      id: crypto.randomUUID(),
      channelId,
      processingStatus: "NOT_STARTED",
      processingStartedAt: null,
      processingCompletedAt: null,
      failReason: null,
      videosWithValidCaptionsCount: 0,
      videosWithNoCaptionsCount: 0,
      videosWithNotSuitableCaptionsCount: 0,
      consecutiveFailedVideosCount: 0,
      totalFailedVideosCount: 0,
      processedVideosCount: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  markAsFailed({
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
        "videosWithValidCaptionsCount",
        "videosWithNoCaptionsCount",
        "videosWithNotSuitableCaptionsCount",
        "consecutiveFailedVideosCount",
        "totalFailedVideosCount",
        "processedVideosCount",
      ]),
      processingStatus: "FAIL",
      processingCompletedAt: now,
      updatedAt: now,
    };
  }

  markAsSuccess({
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
        "videosWithValidCaptionsCount",
        "videosWithNoCaptionsCount",
        "videosWithNotSuitableCaptionsCount",
        "consecutiveFailedVideosCount",
        "totalFailedVideosCount",
        "processedVideosCount",
      ]),
      processingStatus: "SUCCESS",
      processingCompletedAt: now,
      updatedAt: now,
    };
  }
}
