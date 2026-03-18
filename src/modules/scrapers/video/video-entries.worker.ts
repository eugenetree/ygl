import { injectable } from "inversify";
import { Logger } from "../../_common/logger/logger.js";
import { ProcessVideoEntryUseCase } from "./use-cases/process-video-entry/process-video-entry.use-case.js";

@injectable()
export class VideoEntriesWorker {
  private isRunning: boolean = false;

  constructor(
    private readonly logger: Logger,
    private readonly processVideoEntry: ProcessVideoEntryUseCase
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

      const result = await this.processVideoEntry.execute();

      if (!result.ok) {
        this.logger.error({ error: result.error });
        this.isRunning = false;
        return;
      }

      if (result.value.status === "empty") {
        this.logger.info("Video entries queue is empty. Waiting...");
        await new Promise((resolve) => setTimeout(resolve, 1000 * 60));
        continue;
      }

      await new Promise((resolve) => setTimeout(resolve, 1000 * 5));
    }
  }
}
