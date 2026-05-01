import { injectable } from "inversify";

import { DatabaseClient } from "../../../../db/client.js";
import { Failure, Result, Success } from "../../../../types/index.js";
import { tryCatch } from "../../../_common/try-catch.js";
import { Logger } from "../../../_common/logger/logger.js";
import { ChannelProps } from "./channel.js";
import { DatabaseError } from "../../../../db/types.js";

@injectable()
export class ChannelRepository {
  constructor(
    private readonly logger: Logger,
    private readonly db: DatabaseClient,
  ) {
    this.logger.setContext(ChannelRepository.name);
  }

  async create(channel: ChannelProps): Promise<Result<void, DatabaseError>> {
    const insertResult = await tryCatch(
      this.db
        .insertInto("channels")
        .values(channel)
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
