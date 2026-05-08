import { injectable } from "inversify";
import { DatabaseError } from "../../../db/types.js";
import { Result, Success } from "../../../types/index.js";
import { ChannelPriorityService } from "../channel-priority/channel-priority.service.js";
import { ChannelEntryRepository } from "../scrapers/channel-discovery/channel-entry.repository.js";
import { ChannelEntriesQueue } from "../scrapers/channel/channel-entries.queue.js";
import { BoostedChannelsRepository } from "./boosted-channels.repository.js";

export type PushChannelResult =
  | { status: "ADDED" }
  | { status: "PRIORITIZED"; updatedChannelJobs: number; updatedVideoDiscoveryJobs: number; updatedVideoJobs: number };

@injectable()
export class PushChannelUseCase {
  constructor(
    private readonly channelPriorityService: ChannelPriorityService,
    private readonly channelEntryRepository: ChannelEntryRepository,
    private readonly channelEntriesQueue: ChannelEntriesQueue,
    private readonly boostedChannelsRepository: BoostedChannelsRepository,
  ) { }

  public async execute(channelId: string): Promise<Result<PushChannelResult, DatabaseError>> {
    const boostResult = await this.boostedChannelsRepository.boost(channelId);
    if (!boostResult.ok) return boostResult;

    const channelEntryResult = await this.channelEntryRepository.findById(channelId);
    if (!channelEntryResult.ok) return channelEntryResult;

    if (!channelEntryResult.value) {
      const createResult = await this.channelEntryRepository.create({ id: channelId, queryId: null });
      if (!createResult.ok) return createResult;

      const enqueueResult = await this.channelEntriesQueue.enqueue(channelId);
      if (!enqueueResult.ok) return enqueueResult;

      const recalcResult = await this.channelPriorityService.recalculate(channelId);
      if (!recalcResult.ok) return recalcResult;

      return Success({ status: "ADDED" });
    }

    const recalcResult = await this.channelPriorityService.recalculate(channelId);
    if (!recalcResult.ok) return recalcResult;

    return Success({ status: "PRIORITIZED", ...recalcResult.value });
  }
}
