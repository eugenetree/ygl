import { dbClient } from "../../../db/client.js";
import { Logger } from "../../_common/logger/logger.js";
import { tryCatch } from "../../_common/try-catch.js";
import { DatabaseError, SearchChannelEntryDb } from "../../../db/types.js";
import { Failure, Result, Success } from "../../../types/index.js";
import { injectable } from "inversify";

@injectable()
export class ChannelEntriesQueue {
  constructor(private readonly logger: Logger) { }

  public async getNextEntry(): Promise<Result<
    SearchChannelEntryDb | null,
    DatabaseError
  >> {
    const result =
      await tryCatch(
        dbClient
          .updateTable("searchChannelEntries")
          .set({
            processingStatus: "PROCESSING",
          })
          .where(
            "id",
            "in",
            (eb) =>
              eb.selectFrom("searchChannelEntries")
                .select("id")
                .where("processingStatus", "=", "PENDING")
                .limit(1)
                .forUpdate()
                .skipLocked()
          )
          .returningAll()
          .executeTakeFirst()
      )

    if (!result.ok) {
      return Failure({
        type: "DATABASE",
        error: result.error,
      })
    }

    const nextEntry = result.value;
    if (!nextEntry) {
      return Success(null);
    }

    return Success(nextEntry)
  }

  public async markAsSuccess(entryId: string): Promise<Result<void, DatabaseError>> {
    const result =
      await tryCatch(
        dbClient
          .updateTable("searchChannelEntries")
          .set({
            processingStatus: "SUCCEEDED",
          })
          .where("id", "=", entryId)
          .execute()
      )

    if (!result.ok) {
      return Failure({
        type: "DATABASE",
        error: result.error,
      })
    }

    return Success(undefined)
  }

  public async markAsFailed(entryId: string): Promise<Result<void, DatabaseError>> {
    const result =
      await tryCatch(
        dbClient
          .updateTable("searchChannelEntries")
          .set({
            processingStatus: "FAILED",
          })
          .where("id", "=", entryId)
          .execute()
      )

    if (!result.ok) {
      return Failure({
        type: "DATABASE",
        error: result.error,
      })
    }

    return Success(undefined)
  }
}
