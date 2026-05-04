import { tryCatch } from "../../../_common/try-catch.js";
import { DatabaseError, ChannelEntryRow } from "../../../../db/types.js";
import { Failure, Result, Success } from "../../../../types/index.js";
import { injectable } from "inversify";
import { sql } from "kysely";
import { DatabaseClient } from "../../../../db/client.js";

@injectable()
export class ChannelEntriesQueue {
  constructor(private readonly db: DatabaseClient) {}

  public async enqueue(channelId: string): Promise<Result<void, DatabaseError>> {
    const scoreRow = await this.db
      .selectFrom("channelPriorityScores")
      .select("score")
      .where("channelId", "=", channelId)
      .executeTakeFirst();
    const priority = scoreRow?.score ?? 0;

    const result = await tryCatch(
      this.db
        .insertInto("channelJobs")
        .values({ channelId, status: "PENDING", priority, statusUpdatedAt: new Date() })
        .execute(),
    );

    if (!result.ok) {
      return Failure({ type: "DATABASE", error: result.error });
    }

    return Success(undefined);
  }

  public async getNextEntry(): Promise<Result<ChannelEntryRow | null, DatabaseError>> {
    const result = await tryCatch(
      this.db.transaction().execute(async (trx) => {
        const job = await trx
          .updateTable("channelJobs")
          .set({ status: "PROCESSING", statusUpdatedAt: new Date() })
          .where(
            "id",
            "in",
            (eb) =>
              eb.selectFrom("channelJobs")
                .select("id")
                .where("status", "=", "PENDING")
                // temporary things to discover more scenarios
                .orderBy("priority", "desc")
                .orderBy(sql`random()`)
                .limit(1)
                .forUpdate()
                .skipLocked(),
          )
          .returning("channelId")
          .executeTakeFirst();

        if (!job) return null;
        return trx
          .selectFrom("channelEntries")
          .selectAll()
          .where("id", "=", job.channelId)
          .executeTakeFirst();
      })
    );

    if (!result.ok) {
      return Failure({ type: "DATABASE", error: result.error });
    }

    return Success(result.value ?? null);
  }

  public async markAsSuccess(entryId: string): Promise<Result<void, DatabaseError>> {
    const result = await tryCatch(
      this.db
        .updateTable("channelJobs")
        .set({ status: "SUCCEEDED", statusUpdatedAt: new Date() })
        .where("channelId", "=", entryId)
        .execute()
    );

    if (!result.ok) {
      return Failure({ type: "DATABASE", error: result.error });
    }

    return Success(undefined);
  }

  public async markAsFailed(entryId: string): Promise<Result<void, DatabaseError>> {
    const result = await tryCatch(
      this.db
        .updateTable("channelJobs")
        .set({ status: "FAILED", statusUpdatedAt: new Date() })
        .where("channelId", "=", entryId)
        .execute()
    );

    if (!result.ok) {
      return Failure({ type: "DATABASE", error: result.error });
    }

    return Success(undefined);
  }
}
