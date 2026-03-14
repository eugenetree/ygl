import { injectable } from "inversify";
import { dbClient } from "../../../../db/client.js";
import { DatabaseError } from "../../../../db/types.js";
import { Failure, Result, Success } from "../../../../types/index.js";
import { tryCatch } from "../../../_common/try-catch.js";
import { ChannelVideosHealth } from "./channel-videos-health.js";

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

    if (result.value) {
      return Success(ChannelVideosHealth._fromPersistance(result.value));
    }

    return Success(null);
  }

  public async save(healthRecord: ChannelVideosHealth): Promise<Result<void, DatabaseError>> {
    const result = await tryCatch(
      dbClient.insertInto("channelVideosHealth")
        .values(healthRecord)
        .onConflict((eb) => eb.column("id").doUpdateSet(healthRecord))
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