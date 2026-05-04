import { injectable } from "inversify";
import { DatabaseError } from "../../../db/types.js";
import { Failure, Result, Success } from "../../../types/index.js";
import { tryCatch } from "../../_common/try-catch.js";
import { ChannelPriorityService } from "../channel-priority/channel-priority.service.js";
import { PRIORITY_MANUAL_BOOST } from "../channel-priority/channel-priority.constants.js";
import { DatabaseClient } from "../../../db/client.js";

@injectable()
export class PushChannelUseCase {
  constructor(
    private readonly db: DatabaseClient,
    private readonly channelPriorityService: ChannelPriorityService,
  ) {}

  public async execute(channelId: string): Promise<Result<{ message: string }, DatabaseError>> {
    const boostResult = await tryCatch(
      this.db
        .insertInto("boostedChannels")
        .values({ channelId })
        .onConflict((oc) => oc.column("channelId").doNothing())
        .execute(),
    );
    if (!boostResult.ok) {
      return Failure({ type: "DATABASE", error: boostResult.error });
    }

    const channelEntryResult = await tryCatch(
      this.db
        .selectFrom("channelEntries")
        .select("id")
        .where("id", "=", channelId)
        .executeTakeFirst(),
    );
    if (!channelEntryResult.ok) {
      return Failure({ type: "DATABASE", error: channelEntryResult.error });
    }

    if (!channelEntryResult.value) {
      const insertResult = await tryCatch(
        this.db.transaction().execute(async (trx) => {
          await trx
            .insertInto("channelEntries")
            .values({ id: channelId, queryId: null })
            .execute();
          await trx
            .insertInto("channelJobs")
            .values({ channelId, status: "PENDING", priority: PRIORITY_MANUAL_BOOST, statusUpdatedAt: new Date() })
            .execute();
        }),
      );
      if (!insertResult.ok) {
        return Failure({ type: "DATABASE", error: insertResult.error });
      }

      const recalcResult = await this.channelPriorityService.recalculate(channelId);
      if (!recalcResult.ok) return recalcResult;

      return Success({ message: `Channel ${channelId} queued for scraping with priority.` });
    }

    const recalcResult = await this.channelPriorityService.recalculate(channelId);
    if (!recalcResult.ok) return recalcResult;

    const stageResult = await tryCatch(this.detectStageMessage(channelId));
    if (!stageResult.ok) {
      return Failure({ type: "DATABASE", error: stageResult.error });
    }

    return Success({ message: stageResult.value });
  }

  private async detectStageMessage(channelId: string): Promise<string> {
    const channelJob = await this.db
      .selectFrom("channelJobs")
      .select("status")
      .where("channelId", "=", channelId)
      .executeTakeFirst();

    if (!channelJob || channelJob.status === "PENDING") {
      return `Channel ${channelId} scraping job prioritized.`;
    }

    const vdJob = await this.db
      .selectFrom("videoDiscoveryJobs")
      .select("status")
      .where("channelId", "=", channelId)
      .executeTakeFirst();

    if (!vdJob || vdJob.status === "PENDING") {
      return `Channel ${channelId} video discovery job prioritized.`;
    }

    const pendingVideoCount = await this.db
      .selectFrom("videoJobs")
      .select((eb) => eb.fn.countAll<number>().as("count"))
      .where("channelId", "=", channelId)
      .where("status", "=", "PENDING")
      .executeTakeFirstOrThrow();

    const count = Number(pendingVideoCount.count);
    if (count === 0) {
      return `Channel ${channelId} is fully processed — no pending jobs to prioritize.`;
    }

    return `Channel ${channelId}: ${count} pending video jobs prioritized.`;
  }
}
