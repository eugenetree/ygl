import { injectable } from "inversify";
import { dbClient } from "../../../../db/client.js";
import { DatabaseError } from "../../../../db/types.js";
import { Failure, Result, Success } from "../../../../types/index.js";
import { tryCatch } from "../../../_common/try-catch.js";
import { ChannelVideosHealth, CreateChannelVideosHealthParams } from "./channel-videos-health.js";

@injectable()
export class ChannelVideoHealthRepository {
  public async getHealthRecord(id: string): Promise<Result<ChannelVideosHealth | null, DatabaseError>> {
    const result = await tryCatch(
      dbClient.selectFrom("channelVideosHealth")
        .selectAll()
        .where("id", "=", id)
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

  public async create(healthRecord: CreateChannelVideosHealthParams): Promise<Result<void, DatabaseError>> {
    const result = await tryCatch(
      dbClient.insertInto("channelVideosHealth")
        .values({
          ...healthRecord,
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

  public async update(healthRecord: ChannelVideosHealth): Promise<Result<void, DatabaseError>> {
    const result = await tryCatch(
      dbClient.updateTable("channelVideosHealth")
        .set(healthRecord)
        .where("id", "=", healthRecord.id)
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