import { injectable } from "inversify";
import { Logger } from "../../_common/logger/logger.js";
import { ChannelEntriesQueue } from "./channel-entries.queue.js";
import { ProcessChannelEntryUseCase } from "./use-cases/process-channel-entry.use-case.js";

@injectable()
export class ChannelEntriesWorker {
  private isRunning: boolean = false;

  constructor(
    private readonly logger: Logger,
    private readonly channelEntriesQueue: ChannelEntriesQueue,
    private readonly processChannelEntry: ProcessChannelEntryUseCase,
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

      await new Promise((resolve) => setTimeout(resolve, 5000));
      this.logger.info(`Processing channel entry ${entry.id}...`);

      const processResult = await this.processChannelEntry.execute({ channelId: entry.id });
      if (!processResult.ok) {
        this.logger.error({
          message: `Failed to process channel entry ${entry.id}`,
          error: processResult.error,
          context: { entryId: entry.id },
        });

        const markAsFailedResult = await this.channelEntriesQueue.markAsFailed(entry.id);
        if (!markAsFailedResult.ok) {
          this.logger.error({
            message: `Failed to mark channel entry ${entry.id} as failed`,
            error: markAsFailedResult.error,
            context: { entryId: entry.id },
          });

          this.isRunning = false;
          return;
        }

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

        this.isRunning = false;
        return;
      }
    }
  }
}
