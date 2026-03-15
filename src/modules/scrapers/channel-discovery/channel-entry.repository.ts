import { dbClient } from "../../../db/client.js";
import { DatabaseError } from "../../../db/types.js";
import { Failure, Result, Success } from "../../../types/index.js";
import { tryCatch } from "../../_common/try-catch.js";
import { ChannelEntry, ChannelEntryProps } from "./channel-entry.js";

export class ChannelEntryRepository {
  public async create(channelEntry: ChannelEntryProps): Promise<Result<void, DatabaseError>> {
    const result = await tryCatch(
      dbClient
        .insertInto("channelEntries")
        .values(channelEntry)
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

  public async findById(id: string): Promise<Result<ChannelEntry | null, DatabaseError>> {
    const result = await tryCatch(
      dbClient
        .selectFrom("channelEntries")
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

    const entry = result.value;
    if (!entry) {
      return Success(null)
    }

    return Success(entry);
  }
}