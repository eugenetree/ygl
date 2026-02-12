import { injectable } from "inversify";

import { Failure, Success } from "../../../../types/index.js";
import { Logger } from "../../../_common/logger/logger.js";
import {
  DELAY_WHEN_FAILED_TO_GET_NEXT_CHANNEL,
  DELAY_WHEN_FAILED_TO_PROCESS_CHANNEL,
  DELAY_WHEN_NO_CHANNEL,
  DELAY_WHEN_SUCCESS_PROCESSING_CHANNEL,
} from "./constants.js";
import { ChannelRepository } from "./repositories/channel-repository.js";
import { ChannelInitialProcessor } from "./channel-initial-scan.service.js";
import { ChannelVideosScrapeMetadataService } from "../../../domain/channel-videos-scrape-metadata.service.js";

@injectable()
export class RunChannelInitialScanUseCase {
  constructor(
    private readonly logger: Logger,
    private readonly channelRepository: ChannelRepository,
    private readonly channelInitialProcessor: ChannelInitialProcessor,
    private readonly channelVideosScrapeMetadataService: ChannelVideosScrapeMetadataService,
  ) { }

  async execute() {
    const channelResult =
      await this.channelRepository.getNextChannelForInitialProcessing({
        createMetadata: this.channelVideosScrapeMetadataService.create
      });

    if (!channelResult.ok) {
      this.logger.error({
        message: `Failed to get next channel to process. Waiting for ${DELAY_WHEN_FAILED_TO_GET_NEXT_CHANNEL}ms.`,
        error: channelResult.error,
      });

      return Failure({
        type: "ERROR_GETTING_NEXT_CHANNEL_TO_PROCESS",
        waitFor: DELAY_WHEN_FAILED_TO_GET_NEXT_CHANNEL,
      });
    }

    if (!channelResult.value) {
      this.logger.info(
        `No channel to process. Waiting for ${DELAY_WHEN_NO_CHANNEL}ms.`,
      );

      return Failure({
        type: "NO_CHANNEL_FOUND_TO_PROCESS",
        waitFor: DELAY_WHEN_NO_CHANNEL,
      });
    }

    const { channel, videosScrapeMetadata } = channelResult.value;

    const updateMetadataResult = await this.channelRepository.saveMetadata(
      this.channelVideosScrapeMetadataService.markAsInProgress({
        videosScrapeMetadata,
      }),
    )

    if (!updateMetadataResult.ok) {
      this.logger.error({
        message: `Failed to update metadata.`,
        error: updateMetadataResult.error,
      });

      return Failure({
        waitFor: DELAY_WHEN_FAILED_TO_PROCESS_CHANNEL,
        error: updateMetadataResult.error,
      });
    }

    const processResult = await this.channelInitialProcessor.process(
      {
        channel,
        previousMetadata: videosScrapeMetadata,
      },
    );

    if (!processResult.ok) {
      const saveMetadataResult = await this.channelRepository.saveMetadata(
        this.channelVideosScrapeMetadataService.markAsFailed({
          videosScrapeMetadata,
          processingContext: processResult.error.processingContext.currentContext,
          ...this.mapFailureState(processResult.error.type),
        }),
      )

      if (!saveMetadataResult.ok) {
        this.logger.error({
          message: `Failed to save metadata.`,
          error: saveMetadataResult.error,
          context: {
            channelId: channel.id,
            processingContext: processResult.error.processingContext,
          },
        });

        return Failure({
          waitFor: DELAY_WHEN_FAILED_TO_PROCESS_CHANNEL,
          error: saveMetadataResult.error,
        });
      }

      return Failure({
        waitFor: DELAY_WHEN_FAILED_TO_PROCESS_CHANNEL,
        error: processResult.error,
      });
    }

    const saveMetadataResult = await this.channelRepository.saveMetadata(
      this.channelVideosScrapeMetadataService.markAsCompleted({
        videosScrapeMetadata,
        processingContext: processResult.value.processingContext,
      }),
    );

    if (!saveMetadataResult.ok) {
      this.logger.error({
        message: `Failed to save metadata.`,
        error: saveMetadataResult.error,
      });

      return Failure({
        waitFor: DELAY_WHEN_FAILED_TO_PROCESS_CHANNEL,
        error: saveMetadataResult.error,
      });
    }

    return Success({
      waitFor: DELAY_WHEN_SUCCESS_PROCESSING_CHANNEL,
    });
  }

  private mapFailureState(
    errorType:
      | "CHANNEL_HAS_NO_VIDEOS"
      | "TOO_MANY_CONSECUTIVE_FAILED_VIDEOS"
      | "LOW_PERCENTAGE_OF_VIDEOS_WITH_VALID_CAPTIONS"
      | "VIDEO_PERSISTING_FAILED",
  ): {
    processingStatus: "FAILED" | "TERMINATED_EARLY";
    failureReason?: "TOO_MANY_CONSECUTIVE_FAILED_VIDEOS";
    terminationReason?:
    | "CHANNEL_HAS_NO_VIDEOS"
    | "LOW_PERCENTAGE_OF_VIDEOS_WITH_VALID_CAPTIONS";
  } {
    if (errorType === "TOO_MANY_CONSECUTIVE_FAILED_VIDEOS") {
      return {
        processingStatus: "FAILED",
        failureReason: "TOO_MANY_CONSECUTIVE_FAILED_VIDEOS",
      };
    }

    if (
      errorType === "CHANNEL_HAS_NO_VIDEOS" ||
      errorType === "LOW_PERCENTAGE_OF_VIDEOS_WITH_VALID_CAPTIONS"
    ) {
      return {
        processingStatus: "TERMINATED_EARLY",
        terminationReason: errorType,
      };
    }

    return {
      processingStatus: "FAILED",
    };
  }
}
