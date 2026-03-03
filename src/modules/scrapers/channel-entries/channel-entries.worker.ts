import { injectable } from "inversify";
import { Logger } from "../../_common/logger/logger.js";
import { ChannelEntriesQueue } from "./channel-entries.queue.js";
import { ChannelEntriesProcessor } from "./channel-entries.processor.js";

@injectable()
export class ChannelEntriesWorker {
  private isRunning: boolean = false;

  constructor(
    private readonly logger: Logger,
    private readonly channelEntriesQueue: ChannelEntriesQueue,
    private readonly channelEntriesProcessor: ChannelEntriesProcessor,
  ) { }

  public async start() {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;

    while (this.isRunning) {
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
        this.logger.info("No PENDING search-channel-entries found. Waiting...");
        await new Promise((resolve) => setTimeout(resolve, 1000 * 60));
        continue;
      }

      this.logger.info(`Processing channel entry ${entry.id}`);
      const processResult = await this.channelEntriesProcessor.process(entry);

      if (!processResult.ok) {
        this.logger.error({
          error: processResult.error,
          context: { entryId: entry.id },
        });

        // E.g if it's a deleted channel, mark it as FAILED
        await this.channelEntriesQueue.markAsFailed(entry.id);
        continue;
      }

      const markAsSuccessResult = await this.channelEntriesQueue.markAsSuccess(entry.id);

      if (!markAsSuccessResult.ok) {
        this.logger.error({
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
