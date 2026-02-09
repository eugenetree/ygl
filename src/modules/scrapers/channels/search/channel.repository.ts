import { injectable } from "inversify";

import { dbClient } from "../../../../db/client.js";
import { Failure, Result, Success } from "../../../../types/index.js";
import { tryCatch } from "../../../_common/try-catch.js";
import { Logger } from "../../../_common/logger/logger.js";
import { Channel as DomainChannel } from "../../../domain/channel.js";
import { Channel as ApiChannel } from "../../../youtube-api/youtube-api.types.js";
import { ChannelDiscoveryStrategy, DatabaseError } from "../../../../db/types.js";

// TODO: migrate to service layer before accessing repository
@injectable()
export class ChannelRepository {
  constructor(private readonly logger: Logger) {
    this.logger.setContext(ChannelRepository.name);
  }

  async findById(id: string): Promise<Result<DomainChannel | null, DatabaseError>> {
    const result = await tryCatch(
      dbClient
        .selectFrom("channels")
        .selectAll()
        .where("id", "=", id)
        .executeTakeFirst(),
    );

    if (!result.ok) {
      return Failure({
        type: "DATABASE",
        error: result.error,
        context: { id },
      });
    }

    return Success((result.value as DomainChannel | undefined) ?? null);
  }

  async create(
    channel: ApiChannel,
    metadata: { discoveryStrategy: ChannelDiscoveryStrategy },
  ): Promise<Result<void, DatabaseError>> {
    const insertResult = await tryCatch(
      dbClient
        .insertInto("channels")
        .values({
          id: channel.id,
          name: channel.name,
          description: channel.description,
          subscriberCount: channel.subscriberCount,
          viewCount: channel.viewCount,
          videoCount: channel.videoCount,
          countryCode: channel.countryCode,
          isFamilySafe: channel.isFamilySafe,
          channelCreatedAt: channel.channelCreatedAt,
          username: channel.username,
          isArtist: channel.isArtist,
          discoveryStrategy: metadata.discoveryStrategy,
        })
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

    this.logger.info(`Channel ${channel.id} created via ${metadata.discoveryStrategy}.`);
    return Success(undefined);
  }
}

// re-export removed; using this implementation
