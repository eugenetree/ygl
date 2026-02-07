import { injectable } from "inversify";
import { Logger } from "../../../../_common/logger/logger.js";
import { Failure, Result, Success } from "../../../../../types/index.js";
import { tryCatch } from "../../../../_common/try-catch.js";
import { dbClient } from "../../../../../db/client.js";
import { ChannelVideosScrapeMetadata } from "../../../../domain/channel-videos-scrape-metadata.js";

@injectable()
export class ChannelRepository {
  constructor(private readonly logger: Logger) {
    this.logger.setContext(ChannelRepository.name);
  }

  async getNextChannelForInitialProcessing(
    { createMetadata }: { createMetadata: (params: { channelId: string }) => ChannelVideosScrapeMetadata }
  ) {
    const result = await tryCatch(
      dbClient.transaction().execute(async (trx) => {
        const channelRecord = await trx
          .selectFrom("channels")
          .selectAll("channels")
          .where((eb) =>
            eb.not(
              eb.exists(
                eb
                  .selectFrom("channelVideosScrapeMetadata")
                  .select("channelVideosScrapeMetadata.id")
                  .whereRef(
                    "channelVideosScrapeMetadata.channelId",
                    "=",
                    "channels.id",
                  ),
              ),
            ),
          )
          .orderBy("channels.createdAt", "asc")
          .limit(1)
          .forUpdate()
          .skipLocked()
          .executeTakeFirst();

        if (!channelRecord) {
          return null;
        }

        const metadata = createMetadata({ channelId: channelRecord.id });
        
        const metadataRecord = await trx
          .insertInto("channelVideosScrapeMetadata")
          .values(metadata)
          .returningAll()
          .executeTakeFirst();


        if (!metadataRecord) {
          throw new Error("Failed to create metadata record");
        }

        return {
          channel: channelRecord,
          videosScrapeMetadata: metadataRecord,
        };
      })
    );

    if (!result.ok) {
      return Failure(result.error);
    }

    if (!result.value) {
      return Success(null);
    }

    return Success(result.value);
  }

  async saveMetadata(metadata: ChannelVideosScrapeMetadata): Promise<Result<null, Error>> {
    const updateResult = await tryCatch(
      dbClient.updateTable("channelVideosScrapeMetadata")
        .set(metadata)
        .where("channelId", "=", metadata.channelId)
        .execute(),
    );

    if (!updateResult.ok) {
      return Failure(updateResult.error);
    }

    return Success(null);
  }

  // async markAsFailed({
  //   channelId,
  //   videosScrapeMetadata,
  // }: {
  //   channelId: string;
  //   videosScrapeMetadata: ChannelVideosScrapeMetadata;
  // }): Promise<Result<null, Error>> {
  //   const updateResult = await tryCatch(
  //     dbClient.updateTable("channelVideosScrapeMetadata")
  //       .set({
  //         processingStatus: "FAIL",
  //         videosWithValidCaptionsCount: videosScrapeMetadata.videosWithValidCaptionsCount,
  //         videosWithNoCaptionsCount: videosScrapeMetadata.videosWithNoCaptionsCount,
  //         videosWithNotSuitableCaptionsCount: videosScrapeMetadata.videosWithNotSuitableCaptionsCount,
  //         consecutiveFailedVideosCount: videosScrapeMetadata.consecutiveFailedVideosCount,
  //         totalFailedVideosCount: videosScrapeMetadata.totalFailedVideosCount,
  //         processedVideosCount: videosScrapeMetadata.processedVideosCount,
  //       })
  //     .where("channelId", "=", channelId)
  //     .execute(),
  //   )

  //   if (!updateResult.ok) {
  //     return Failure(updateResult.error);
  //   }

  //   return Success(null);
  // }

  // async markAsSuccess({
  //   channelId,
  //   processingContext,
  // }: {
  //   channelId: string;
  //   processingContext: ChannelVideosScrapeMetadata;
  // }): Promise<Result<null, Error>> {
  //   const updateResult = await tryCatch(
  //     dbClient.updateTable("channelVideosScrapeMetadata")
  //       .set({
  //         processingStatus: "success",
  //         videosWithValidCaptionsCount: processingContext.videosWithValidCaptionsCount,
  //         videosWithNoCaptionsCount: processingContext.videosWithNoCaptionsCount,
  //         videosWithNotSuitableCaptionsCount: processingContext.videosWithNotSuitableCaptionsCount,
  //         consecutiveFailedVideosCount: processingContext.consecutiveFailedVideosCount,
  //         totalFailedVideosCount: processingContext.totalFailedVideosCount,
  //         processedVideosCount: processingContext.processedVideosCount,
  //       })
  //       .where("channelId", "=", channelId)
  //       .execute(),
  //   );

  //   if (!updateResult.ok) {
  //     return Failure(updateResult.error);
  //   }

  //   return Success(null);
  // }
}