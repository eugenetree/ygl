import { injectable } from "inversify";
import { Logger } from "../../_common/logger/logger.js";
import { ChannelEntriesQueue } from "./channel-entries.queue.js";
import { ProcessChannelEntryUseCase } from "./use-cases/process-channel-entry.use-case.js";
import { ChannelsQueue } from "../video-discovery/index.js";

@injectable()
export class ChannelEntriesWorker {
  private isRunning: boolean = false;

  constructor(
    private readonly logger: Logger,
    private readonly channelEntriesQueue: ChannelEntriesQueue,
    private readonly processChannelEntry: ProcessChannelEntryUseCase,
    private readonly channelsQueue: ChannelsQueue,
  ) { }

  public async start(shouldContinue: () => boolean = () => true) {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;

    while (this.isRunning) {
      if (!shouldContinue()) {
        this.logger.info("shouldContinue() returned false. Stopping worker.");
        this.isRunning = false;
        return;
      }

      const entryResult = await this.channelEntriesQueue.getNextEntry();

      if (!entryResult.ok) {
        this.logger.error({
          error: entryResult.error,
        });

        this.isRunning = false;
        return;
      }

      const entry = entryResult.value;

      if (!entry) {
        this.logger.info("Channel entries queue is empty. Waiting...");
        await new Promise((resolve) => setTimeout(resolve, 1000 * 60));
        continue;
      }

      this.logger.info(`Processing channel entry ${entry.id}...`);
      const processResult = await this.processChannelEntry.execute(entry);

      if (!processResult.ok) {
        this.logger.error({
          message: `Failed to process channel entry ${entry.id}`,
          error: processResult.error,
          context: { entryId: entry.id },
        });

        await this.channelEntriesQueue.markAsFailed(entry.id);
        continue;
      }

      const channel = processResult.value;

      const enqueueResult = await this.channelsQueue.enqueue(channel.id);

      if (!enqueueResult.ok) {
        this.logger.error({
          message: `Failed to enqueue channel ${channel.id} for video discovery`,
          error: enqueueResult.error,
          context: { channelId: channel.id },
        });

        await this.channelEntriesQueue.markAsFailed(entry.id);
        continue;
      }

      this.logger.info(`Processing channel entry ${entry.id} finished`);

      const markAsSuccessResult = await this.channelEntriesQueue.markAsSuccess(entry.id);

      if (!markAsSuccessResult.ok) {
        this.logger.error({
          message: `Failed to mark channel entry ${entry.id} as success`,
          error: markAsSuccessResult.error,
          context: { entryId: entry.id },
        });

        await this.channelEntriesQueue.markAsFailed(entry.id);
        this.isRunning = false;
        return;
      }
    }
  }
}
