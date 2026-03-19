import { injectable } from "inversify";
import { Logger } from "../../_common/logger/logger.js";
import { ProcessChannelEntryUseCase } from "./use-cases/process-channel-entry.use-case.js";
import { ChannelEntriesQueue } from "./channel-entries.queue.js";

@injectable()
export class ChannelEntriesWorker {
  private isRunning: boolean = false;

  constructor(
    private readonly logger: Logger,
    private readonly processChannelEntry: ProcessChannelEntryUseCase,
    private readonly channelEntriesQueue: ChannelEntriesQueue,
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
        this.logger.error({ error: entryResult.error });
        this.isRunning = false;
        return;
      }

      const entry = entryResult.value;

      if (!entry) {
        this.logger.info("Channel entries queue is empty. Waiting...");
        await new Promise((resolve) => setTimeout(resolve, 1000 * 60));
        continue;
      }

      const result = await this.processChannelEntry.execute(entry.id);

      if (!result.ok) {
        this.logger.error({
          message: `Failed to process channel entry ${entry.id}`,
          error: result.error,
          context: { entryId: entry.id },
        });
        await this.channelEntriesQueue.markAsFailed(entry.id);
        continue;
      }

      await this.channelEntriesQueue.markAsSuccess(entry.id);

      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  }
}
