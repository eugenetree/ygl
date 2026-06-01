import { injectable } from "inversify";
import type { DatabaseError } from "../../../db/types.js";
import { type Result, Success } from "../../../types/index.js";
import type { ChannelPriorityService } from "../channel-priority/channel-priority.service.js";
import type { ChannelEntriesQueue } from "../scrapers/channel/channel-entries.queue.js";
import type { ChannelEntryRepository } from "../scrapers/channel-discovery/channel-entry.repository.js";
import type { BoostedChannelsRepository } from "./boosted-channels.repository.js";

export type PushChannelResult =
  | { status: "ADDED" }
  | {
      status: "PRIORITIZED";
      updatedChannelJobs: number;
      updatedVideoDiscoveryJobs: number;
      updatedVideoJobs: number;
    };

@injectable()
export class PushChannelUseCase {
  constructor(
    private readonly channelPriorityService: ChannelPriorityService,
    private readonly channelEntryRepository: ChannelEntryRepository,
    private readonly channelEntriesQueue: ChannelEntriesQueue,
    private readonly boostedChannelsRepository: BoostedChannelsRepository,
  ) {}

  public async execute(
    channelId: string,
  ): Promise<Result<PushChannelResult, DatabaseError>> {
    const boostResult = await this.boostedChannelsRepository.boost(channelId);
    if (!boostResult.ok) return boostResult;

    const channelEntryResult =
      await this.channelEntryRepository.findById(channelId);
    if (!channelEntryResult.ok) return channelEntryResult;

    if (!channelEntryResult.value) {
      const createResult = await this.channelEntryRepository.create({
        id: channelId,
        queryId: null,
      });
      if (!createResult.ok) return createResult;

      const recalcResult =
        await this.channelPriorityService.recalculateScore(channelId);
      if (!recalcResult.ok) return recalcResult;

      const enqueueResult = await this.channelEntriesQueue.enqueue(
        channelId,
        recalcResult.value.scrapingScore,
      );
      if (!enqueueResult.ok) return enqueueResult;

      return Success({ status: "ADDED" });
    }

    const recalcResult =
      await this.channelPriorityService.recalculateScore(channelId);
    if (!recalcResult.ok) return recalcResult;

    const propagateResult =
      await this.channelPriorityService.propagatePriorityToPendingJobs(
        channelId,
        recalcResult.value.scrapingScore,
      );
    if (!propagateResult.ok) return propagateResult;

    return Success({ status: "PRIORITIZED", ...propagateResult.value });
  }
}
