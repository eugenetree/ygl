import { injectable } from "inversify";
import type { DatabaseClient } from "../../../db/client.js";
import type { DatabaseError } from "../../../db/types.js";
import { Failure, type Result, Success } from "../../../types/index.js";
import { tryCatch } from "../../_common/try-catch.js";

@injectable()
export class BoostedChannelsRepository {
  constructor(private readonly db: DatabaseClient) {}

  public async boost(channelId: string): Promise<Result<void, DatabaseError>> {
    const result = await tryCatch(
      this.db
        .insertInto("boostedChannels")
        .values({ channelId })
        .onConflict((oc) => oc.column("channelId").doNothing())
        .execute(),
    );

    if (!result.ok) {
      return Failure({ type: "DATABASE", error: result.error });
    }

    return Success(undefined);
  }
}
