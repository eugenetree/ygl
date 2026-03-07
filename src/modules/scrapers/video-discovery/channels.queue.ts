import { injectable } from "inversify";
import { dbClient } from "../../../db/client.js";
import { DatabaseError } from "../../../db/types.js";
import { Channel } from "../../domain/channel.js";
import { Failure, Result, Success } from "../../../types/index.js";
import { tryCatch } from "../../_common/try-catch.js";
import { Logger } from "../../_common/logger/logger.js";

@injectable()
export class ChannelsQueue {
  constructor(private readonly logger: Logger) {
    this.logger.setContext(ChannelsQueue.name);
  }

  public async getNextChannel(): Promise<Result<Channel | null, DatabaseError>> {
    const result = await tryCatch(
      dbClient
        .updateTable("channels")
        .set({
          videosDiscoveryStatus: "PROCESSING",
          videosDiscoveryStatusUpdatedAt: new Date(),
        })
        .where(
          "id",
          "in",
          (eb) =>
            eb.selectFrom("channels")
              .select("id")
              .where("videosDiscoveryStatus", "=", "PENDING")
              .where("videoCount", "<", 10000)
              .orderBy("subscriberCount", "desc")
              .orderBy("createdAt", "asc")
              .limit(1)
              .forUpdate()
              .skipLocked()
        )
        .returningAll()
        .executeTakeFirst()
    );

    if (!result.ok) {
      return Failure({
        type: "DATABASE",
        error: result.error,
      });
    }

    const nextChannel = result.value;
    if (!nextChannel) {
      return Success(null);
    }

    return Success(nextChannel);
  }

  public async markAsSuccess(channelId: string): Promise<Result<void, DatabaseError>> {
    const result = await tryCatch(
      dbClient
        .updateTable("channels")
        .set({
          videosDiscoveryStatus: "SUCCEEDED",
          videosDiscoveryStatusUpdatedAt: new Date(),
        })
        .where("id", "=", channelId)
        .execute()
    );

    if (!result.ok) {
      return Failure({ type: "DATABASE", error: result.error });
    }

    return Success(undefined);
  }

  public async markAsFailed(channelId: string): Promise<Result<void, DatabaseError>> {
    const result = await tryCatch(
      dbClient
        .updateTable("channels")
        .set({
          videosDiscoveryStatus: "FAILED",
          videosDiscoveryStatusUpdatedAt: new Date(),
        })
        .where("id", "=", channelId)
        .execute()
    );

    if (!result.ok) {
      return Failure({ type: "DATABASE", error: result.error });
    }

    return Success(undefined);
  }
}
