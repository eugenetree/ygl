import { injectable } from "inversify";
import { Logger } from "../../_common/logger/logger.js";
import { ProcessChannelEntryUseCase } from "./use-cases/process-channel-entry.use-case.js";

@injectable()
export class ChannelEntriesWorker {
  private isRunning: boolean = false;

  constructor(
    private readonly logger: Logger,
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

      const result = await this.processChannelEntry.execute();

      if (!result.ok) {
        this.logger.error({ error: result.error });
        this.isRunning = false;
        return;
      }

      if (result.value.status === "empty") {
        this.logger.info("Channel entries queue is empty. Waiting...");
        await new Promise((resolve) => setTimeout(resolve, 1000 * 60));
        continue;
      }

      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  }
}
