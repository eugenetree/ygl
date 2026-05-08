import { injectable } from "inversify";
import { DatabaseClient } from "../../../db/client.js";
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

  async execute(): Promise<RecalculateAllPrioritiesResult> {
    const rows = await this.db
      .selectFrom("channelPriorityScores")
      .select("channelId")
      .execute();

    let failed = 0;

    for (const { channelId } of rows) {
      const result = await this.channelPriorityService.recalculate(channelId);
      if (!result.ok) failed++;
    }

    return { total: rows.length, failed };
  }
}
