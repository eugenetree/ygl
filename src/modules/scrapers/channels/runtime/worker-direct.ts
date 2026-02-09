import { injectable } from "inversify";
import { Logger } from "../../../_common/logger/logger.js";
import { ProcessSearchChannelDirectQueryUseCase } from "../search/process-search-channel-direct-query.use-case.js";

@injectable()
export class SearchChannelsDirectWorker {
  public queryBeingProcessed: string | null = null;

  private isRunning = false;

  constructor(
    private readonly logger: Logger,
    private readonly processSearchQueryUseCase: ProcessSearchChannelDirectQueryUseCase,
  ) {}

  async start() {
    this.logger.info("Starting worker for direct strategy");

    if (this.isRunning) {
      throw new Error("Unexpected state. Worker is already running");
    }

    this.isRunning = true;

    while (this.isRunning) {
      const processSearchQueryResult =
        await this.processSearchQueryUseCase.execute();

      if (!processSearchQueryResult.ok) {
        const timeout = processSearchQueryResult.error.waitFor;
        await new Promise((resolve) => setTimeout(resolve, timeout));
        continue;
      }
    }
  }

  async stop() {
    this.isRunning = false;
  }
}
