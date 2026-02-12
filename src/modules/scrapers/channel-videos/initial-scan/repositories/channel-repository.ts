import { injectable } from "inversify";
import { Logger } from "../../../../_common/logger/logger.js";
import { Failure, Result, Success } from "../../../../../types/index.js";
import { tryCatch } from "../../../../_common/try-catch.js";
import { dbClient } from "../../../../../db/client.js";
import { ChannelVideosScrapeMetadata } from "../../../../domain/channel-videos-scrape-metadata.js";
import { DatabaseError } from "../../../../../db/types.js";

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
          .where("channels.discoveryStrategy", "=", "via-videos")
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

  async saveMetadata(metadata: ChannelVideosScrapeMetadata): Promise<Result<null, DatabaseError>> {
    const updateResult = await tryCatch(
      dbClient.updateTable("channelVideosScrapeMetadata")
        .set(metadata)
        .where("channelId", "=", metadata.channelId)
        .execute(),
    );

    if (!updateResult.ok) {
      return Failure({
        type: "DATABASE",
        error: updateResult.error,
      });
    }

    return Success(null);
  }
}