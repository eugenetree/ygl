import { injectable } from "inversify";
import { DatabaseClient } from "../../../../db/client.js";
import { DatabaseError } from "../../../../db/types.js";
import { Failure, Result, Success } from "../../../../types/index.js";
import { tryCatch } from "../../../_common/try-catch.js";
import { ChannelProcessingStats, ChannelProcessingStatsProps } from "./channel-processing-stats.js";

@injectable()
export class ChannelProcessingStatsRepository {
  constructor(private readonly db: DatabaseClient) {}

  public async getStats(channelId: string): Promise<Result<ChannelProcessingStats | null, DatabaseError>> {
    const result = await tryCatch(
      this.db.selectFrom("channelProcessingStats")
        .selectAll()
        .where("channelId", "=", channelId)
        .executeTakeFirst()
    );

    if (!result.ok) {
      return Failure({
        type: "DATABASE",
        error: result.error,
      });
    }

    return Success(result.value ?? null);
  }

  public async create(stats: ChannelProcessingStatsProps): Promise<Result<void, DatabaseError>> {
    const result = await tryCatch(
      this.db.insertInto("channelProcessingStats")
        .values({
          ...stats,
          id: crypto.randomUUID(),
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .execute()
    );

    if (!result.ok) {
      return Failure({
        type: "DATABASE",
        error: result.error,
      });
    }

    return Success(undefined);
  }

  public async update(stats: ChannelProcessingStats): Promise<Result<void, DatabaseError>> {
    const result = await tryCatch(
      this.db.updateTable("channelProcessingStats")
        .set(stats)
        .where("id", "=", stats.id)
        .execute()
    );

    if (!result.ok) {
      return Failure({
        type: "DATABASE",
        error: result.error,
      });
    }

    return Success(undefined);
  }
}
