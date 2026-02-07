import { injectable } from "inversify";

import { dbClient } from "../../../../../db/client.js";
import { Failure, Result, Success } from "../../../../../types/index.js";
import { tryCatch } from "../../../../_common/try-catch.js";
import { Logger } from "../../../../_common/logger/logger.js";
import { Channel as DomainChannel } from "../../../../domain/channel.js";
import { Channel as ApiChannel } from "../../../../youtube-api/youtube-api.types.js";

@injectable()
export class ChannelRepository {
  constructor(private readonly logger: Logger) {
    this.logger.setContext(ChannelRepository.name);
  }

  async findById(id: string): Promise<Result<DomainChannel | null, Error>> {
    const result = await tryCatch(
      dbClient
        .selectFrom("channels")
        .selectAll()
        .where("id", "=", id)
        .executeTakeFirst(),
    );

    if (!result.ok) {
      return Failure(result.error);
    }

    return Success((result.value as DomainChannel | undefined) ?? null);
  }

  async create(channel: ApiChannel): Promise<Result<void, Error>> {
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
        })
        .execute(),
    );

    if (!insertResult.ok) {
      this.logger.error({
        message: "Failed to create channel",
        error: insertResult.error,
        context: { channelId: channel.id },
      });

      return Failure(insertResult.error);
    }

    this.logger.info(`Channel ${channel.id} created.`);
    return Success(undefined);
  }
}

// re-export removed; using this implementation
