import { injectable } from "inversify";
import type { DatabaseClient } from "../../../db/client.js";
import type { ChannelPriorityService } from "./channel-priority.service.js";

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

  async execute(): Promise<RecalculateAllPrioritiesResult> {
    const rows = await this.db
      .selectFrom("channels")
      .select("id as channelId")
      .execute();

    let failed = 0;

    for (const { channelId } of rows) {
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

    return { total: rows.length, failed };
  }
}
