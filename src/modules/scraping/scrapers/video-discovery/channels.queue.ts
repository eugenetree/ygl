import { injectable } from "inversify";
import { dbClient } from "../../../../db/client.js";
import { DatabaseError } from "../../../../db/types.js";
import { Failure, Result, Success } from "../../../../types/index.js";
import { tryCatch } from "../../../_common/try-catch.js";
import { Logger } from "../../../_common/logger/logger.js";
import { VIDEOS_PER_CHANNEL_LIMIT, SUPPORTED_COUNTRY_CODES } from "./config.js";

@injectable()
export class ChannelsQueue {
  constructor(private readonly logger: Logger) {
    this.logger.setContext(ChannelsQueue.name);
  }

  public async getNextChannel(): Promise<Result<{ id: string } | null, DatabaseError>> {
    const result = await this.getNextChannels(1);
    if (!result.ok) {
      return result;
    }

    return Success(result.value[0] ?? null);
  }

  public async getNextChannels(limit: number): Promise<Result<{ id: string }[], DatabaseError>> {
    const result = await tryCatch(
      dbClient
        .updateTable("channels")
        .set({ videoDiscoveryStatus: "RUNNING", videoDiscoveryStatusUpdatedAt: new Date() })
        .where(
          "id",
          "in",
          (eb) =>
            eb.selectFrom("channels")
              .select("channels.id")
              .where("videoDiscoveryStatus", "=", "PENDING")
              .where("channels.videoCount", "<", VIDEOS_PER_CHANNEL_LIMIT)
              .where("channels.countryCode", "in", SUPPORTED_COUNTRY_CODES)
              .orderBy("channels.subscriberCount", "desc")
              .orderBy("channels.createdAt", "asc")
              .limit(limit)
              .forUpdate()
              .skipLocked()
        )
        .returning("id")
        .execute()
    );

    if (!result.ok) {
      return Failure({ type: "DATABASE", error: result.error });
    }

    return Success(result.value.map((row) => ({ id: row.id })));
  }

  public async markAsSuccess(channelId: string): Promise<Result<void, DatabaseError>> {
    const result = await tryCatch(
      dbClient
        .updateTable("channels")
        .set({ videoDiscoveryStatus: "SUCCEEDED", videoDiscoveryError: null, videoDiscoveryStatusUpdatedAt: new Date() })
        .where("id", "=", channelId)
        .execute()
    );

    if (!result.ok) {
      return Failure({ type: "DATABASE", error: result.error });
    }

    return Success(undefined);
  }

  public async markAsFailed(channelId: string, error?: string): Promise<Result<void, DatabaseError>> {
    const result = await tryCatch(
      dbClient
        .updateTable("channels")
        .set({ videoDiscoveryStatus: "FAILED", videoDiscoveryError: error ?? null, videoDiscoveryStatusUpdatedAt: new Date() })
        .where("id", "=", channelId)
        .execute()
    );

    if (!result.ok) {
      return Failure({ type: "DATABASE", error: result.error });
    }

    return Success(undefined);
  }
}
