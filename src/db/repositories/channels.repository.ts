import { Kysely } from "kysely";

import { tryCatch } from "../../modules/_common/try-catch.js";
import { Failure, Result, Success } from "../../types/index.js";
import { Database } from "../types.js";

export class ChannelsRepository {
  constructor(private db: Kysely<Database>) {}

  /**
   * Find channels that haven't been scraped yet (no record in channelVideosScrapeMetadata)
   */
  async findUnscrapedChannels(
    limit: number = 1,
  ): Promise<
    Result<Array<{ id: string; name: string; createdAt: Date }>, Error>
  > {
    const result = await tryCatch(
      this.db
        .selectFrom("channels")
        .leftJoin(
          "channelVideosScrapeMetadata as cvsm",
          "channels.id",
          "cvsm.channelId",
        )
        .select(["channels.id", "channels.name", "channels.createdAt"])
        .where("cvsm.id", "is", null)
        .orderBy("channels.createdAt", "asc")
        .limit(limit)
        .execute(),
    );

    if (!result.ok) {
      return Failure(
        new Error("Failed to find unscraped channels", { cause: result.error }),
      );
    }

    return Success(result.value);
  }

  /**
   * Find next single channel to scrape
   */
  async findNextUnscrapedChannel(): Promise<
    Result<{ id: string; name: string; createdAt: Date } | null, Error>
  > {
    const result = await tryCatch(
      this.db
        .selectFrom("channels")
        .leftJoin(
          "channelVideosScrapeMetadata as cvsm",
          "channels.id",
          "cvsm.channelId",
        )
        .select(["channels.id", "channels.name", "channels.createdAt"])
        .where("cvsm.id", "is", null)
        .orderBy("channels.createdAt", "asc")
        .executeTakeFirst(),
    );

    if (!result.ok) {
      return Failure(
        new Error("Failed to find next unscraped channel", {
          cause: result.error,
        }),
      );
    }

    return Success(result.value || null);
  }

  /**
   * Check if a specific channel has been scraped
   */
  async isChannelScraped(channelId: string): Promise<Result<boolean, Error>> {
    const result = await tryCatch(
      this.db
        .selectFrom("channelVideosScrapeMetadata")
        .select(["id"])
        .where("channelId", "=", channelId)
        .executeTakeFirst(),
    );

    if (!result.ok) {
      return Failure(
        new Error("Failed to check if channel is scraped", {
          cause: result.error,
        }),
      );
    }

    return Success(!!result.value);
  }
}
