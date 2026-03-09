import { injectable } from "inversify";

import { dbClient } from "../../../db/client.js";
import { Failure, Result, Success } from "../../../types/index.js";
import { tryCatch } from "../../_common/try-catch.js";
import { Logger } from "../../_common/logger/logger.js";
import { Channel } from "../../domain/channel.js";
import { DatabaseError } from "../../../db/types.js";

@injectable()
export class ChannelRepository {
  constructor(private readonly logger: Logger) {
    this.logger.setContext(ChannelRepository.name);
  }

  async create(
    channel: Channel,
  ): Promise<Result<void, DatabaseError>> {
    const insertResult = await tryCatch(
      dbClient
        .insertInto("channels")
        .values({ ...channel, videosDiscoveryStatus: "PENDING", videosDiscoveryStatusUpdatedAt: null })
        .execute(),
    );

    if (!insertResult.ok) {
      this.logger.error({
        message: "Failed to create channel",
        error: insertResult.error,
        context: { channelId: channel.id },
      });

      return Failure({
        type: "DATABASE",
        error: insertResult.error,
      });
    }

    return Success(undefined);
  }
}
