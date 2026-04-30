import { dbClient } from "../../../../db/client.js";
import { Logger } from "../../../_common/logger/logger.js";
import { tryCatch } from "../../../_common/try-catch.js";
import { DatabaseError, ChannelEntryRow } from "../../../../db/types.js";
import { Failure, Result, Success } from "../../../../types/index.js";
import { injectable } from "inversify";
import { sql } from "kysely";

@injectable()
export class ChannelEntriesQueue {
  constructor(private readonly logger: Logger) { }

  public async getNextEntry(): Promise<Result<ChannelEntryRow | null, DatabaseError>> {
    const result = await tryCatch(
      dbClient.transaction().execute(async (trx) => {
        const row = await trx
          .updateTable("channelEntries")
          .set({ channelProcessStatus: "RUNNING", channelProcessStatusUpdatedAt: new Date() })
          .where(
            "id",
            "in",
            (eb) =>
              eb.selectFrom("channelEntries")
                .select("id")
                .where("channelProcessStatus", "=", "PENDING")
                .orderBy(sql`random()`)
                .limit(1)
                .forUpdate()
                .skipLocked(),
          )
          .returningAll()
          .executeTakeFirst();

        return row ?? null;
      })
    );

    if (!result.ok) {
      return Failure({ type: "DATABASE", error: result.error });
    }

    return Success(result.value ?? null);
  }

  public async markAsSuccess(entryId: string): Promise<Result<void, DatabaseError>> {
    const result = await tryCatch(
      dbClient
        .updateTable("channelEntries")
        .set({ channelProcessStatus: "SUCCEEDED", channelProcessError: null, channelProcessStatusUpdatedAt: new Date() })
        .where("id", "=", entryId)
        .execute()
    );

    if (!result.ok) {
      return Failure({ type: "DATABASE", error: result.error });
    }

    return Success(undefined);
  }

  public async markAsFailed(entryId: string, error?: string): Promise<Result<void, DatabaseError>> {
    const result = await tryCatch(
      dbClient
        .updateTable("channelEntries")
        .set({ channelProcessStatus: "FAILED", channelProcessError: error ?? null, channelProcessStatusUpdatedAt: new Date() })
        .where("id", "=", entryId)
        .execute()
    );

    if (!result.ok) {
      return Failure({ type: "DATABASE", error: result.error });
    }

    return Success(undefined);
  }
}
