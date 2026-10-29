import { injectable } from "inversify";
import { DatabaseClient } from "../../../db/client.js";
import type { DatabaseError } from "../../../db/types.js";
import { Failure, type Result, Success } from "../../../types/index.js";
import { tryCatch } from "../../_common/try-catch.js";
import { ChannelPriorityService } from "./channel-priority.service.js";

export type RecalculateAllPrioritiesResult = {
  total: number;
  failed: number;
};

@injectable()
export class RecalculateAllPrioritiesUseCase {
  constructor(
    private readonly db: DatabaseClient,
    private readonly channelPriorityService: ChannelPriorityService,
  ) {}

  async execute(
    signal: AbortSignal,
  ): Promise<Result<RecalculateAllPrioritiesResult, DatabaseError>> {
    const rows = await tryCatch(
      this.db.selectFrom("channels").select("id as channelId").execute(),
    );
    if (!rows.ok) {
      return Failure({ type: "DATABASE", error: rows.error });
    }

    let failed = 0;

    for (const { channelId } of rows.value) {
      if (signal.aborted) break;

      const recalcResult =
        await this.channelPriorityService.recalculateScore(channelId);
      if (!recalcResult.ok) {
        failed++;
        continue;
      }
      const propagateResult =
        await this.channelPriorityService.propagatePriorityToPendingJobs(
          channelId,
          recalcResult.value.scrapingScore,
        );
      if (!propagateResult.ok) failed++;
    }

    return Success({ total: rows.value.length, failed });
  }
}
