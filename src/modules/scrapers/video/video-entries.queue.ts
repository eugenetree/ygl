import { dbClient } from "../../../db/client.js";
import { Logger } from "../../_common/logger/logger.js";
import { tryCatch } from "../../_common/try-catch.js";
import { DatabaseError, VideoEntryRow } from "../../../db/types.js";
import { Failure, Result, Success } from "../../../types/index.js";
import { injectable } from "inversify";
import { sql } from "kysely";

@injectable()
export class VideoEntriesQueue {
  constructor(private readonly logger: Logger) { }

  public async getNextEntry(): Promise<
    Result<VideoEntryRow | null, DatabaseError>
  > {
    const result = await tryCatch(
      dbClient
        .updateTable("videoEntries")
        .set({
          processingStatus: "PROCESSING",
        })
        .where(
          "id",
          "in",
          (eb) =>
            eb
              .selectFrom("videoEntries")
              .select("id")
              .where("processingStatus", "=", "PENDING")
              .orderBy(sql`random()`)
              .limit(1)
              .forUpdate()
              .skipLocked()
        )
        .returningAll()
        .executeTakeFirst()
    );

    if (!result.ok) {
      return Failure({
        type: "DATABASE",
        error: result.error,
      });
    }

    const nextEntry = result.value;
    if (!nextEntry) {
      return Success(null);
    }

    return Success(nextEntry);
  }

  public async markAsSuccess(
    entryId: string
  ): Promise<Result<void, DatabaseError>> {
    const result = await tryCatch(
      dbClient
        .updateTable("videoEntries")
        .set({
          processingStatus: "SUCCEEDED",
        })
        .where("id", "=", entryId)
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

  public async markAsFailed(
    entryId: string
  ): Promise<Result<void, DatabaseError>> {
    const result = await tryCatch(
      dbClient
        .updateTable("videoEntries")
        .set({
          processingStatus: "FAILED",
        })
        .where("id", "=", entryId)
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
