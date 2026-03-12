import { injectable } from "inversify";
import { dbClient } from "../../../db/client.js";
import { DatabaseError } from "../../../db/types.js";
import { Failure, Result, Success } from "../../../types/index.js";
import { tryCatch } from "../../_common/try-catch.js";
import { Logger } from "../../_common/logger/logger.js";
import { VIDEOS_PER_CHANNEL_LIMIT, SUPPORTED_COUNTRY_CODES } from "./config.js";

@injectable()
export class ChannelsQueue {
  constructor(private readonly logger: Logger) {
    this.logger.setContext(ChannelsQueue.name);
  }

  public async enqueue(channelId: string): Promise<Result<void, DatabaseError>> {
    const result = await tryCatch(
      dbClient
        .insertInto("videoDiscoveryJobs")
        .values({ channelId, status: "PENDING", statusUpdatedAt: new Date() })
        .execute(),
    );

    if (!result.ok) {
      return Failure({ type: "DATABASE", error: result.error });
    }

    return Success(undefined);
  }

  public async getNextChannel(): Promise<Result<{ id: string } | null, DatabaseError>> {
    const result = await tryCatch(
      dbClient
        .updateTable("videoDiscoveryJobs")
        .set({ status: "PROCESSING", statusUpdatedAt: new Date() })
        .where(
          "id",
          "in",
          (eb) =>
            eb.selectFrom("videoDiscoveryJobs")
              .innerJoin("channels", "channels.id", "videoDiscoveryJobs.channelId")
              .select("videoDiscoveryJobs.id")
              .where("videoDiscoveryJobs.status", "=", "PENDING")
              .where("channels.videoCount", "<", VIDEOS_PER_CHANNEL_LIMIT)
              .where("channels.countryCode", "in", SUPPORTED_COUNTRY_CODES)
              .orderBy("channels.subscriberCount", "desc")
              .orderBy("videoDiscoveryJobs.createdAt", "asc")
              .limit(1)
              .forUpdate()
              .skipLocked()
        )
        .returning("channelId")
        .executeTakeFirst()
    );

    if (!result.ok) {
      return Failure({ type: "DATABASE", error: result.error });
    }

    if (!result.value) {
      return Success(null);
    }

    return Success({ id: result.value.channelId });
  }

  public async markAsSuccess(channelId: string): Promise<Result<void, DatabaseError>> {
    const result = await tryCatch(
      dbClient
        .updateTable("videoDiscoveryJobs")
        .set({ status: "SUCCEEDED", statusUpdatedAt: new Date() })
        .where("channelId", "=", channelId)
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
        .updateTable("videoDiscoveryJobs")
        .set({ status: "FAILED", statusUpdatedAt: new Date() })
        .where("channelId", "=", channelId)
        .execute()
    );

    if (!result.ok) {
      return Failure({ type: "DATABASE", error: result.error });
    }

    return Success(undefined);
  }
}
