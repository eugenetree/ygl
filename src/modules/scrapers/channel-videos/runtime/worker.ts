import { injectable } from "inversify";
import { Logger } from "../../../_common/logger/logger.js";
import { RunChannelInitialScanUseCase } from "../initial-scan/run-channel-initial-scan.use-case.js";

@injectable()
export class ChannelVideosRuntimeWorker {
  public queryBeingProcessed: string | null = null;

  private isRunning = false;

  constructor(
    private readonly logger: Logger,
    private readonly runChannelInitialScanUseCase: RunChannelInitialScanUseCase,
  ) {}

  async start() {
    this.logger.info("Starting worker");

    if (this.isRunning) {
      throw new Error("Unexpected state. Worker is already running");
    }

    this.isRunning = true;

    while (this.isRunning) {
      const runChannelInitialScanResult =
        await this.runChannelInitialScanUseCase.execute();

      if (!runChannelInitialScanResult.ok) {
        const timeout = runChannelInitialScanResult.error.waitFor;
        await new Promise((resolve) => setTimeout(resolve, timeout));
        continue;
      }
    }
  }

  async stop() {
    this.isRunning = false;
  }
}
