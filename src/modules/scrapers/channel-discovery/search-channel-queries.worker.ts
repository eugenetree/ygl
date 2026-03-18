import { injectable } from "inversify";
import { Logger } from "../../_common/logger/logger.js";
import { FindChannelsUseCase } from "./use-cases/find-channels.use-case.js";

@injectable()
export class SearchChannelQueriesWorker {
  private isRunning: boolean = false;

  constructor(
    private readonly logger: Logger,
    private readonly processSearchQuery: FindChannelsUseCase,
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

      const result = await this.processSearchQuery.execute();

      if (!result.ok) {
        this.logger.error({ error: result.error });
        this.isRunning = false;
        return;
      }

      if (result.value.status === "empty") {
        this.logger.info("Search queries queue is empty. Waiting...");
        await new Promise((resolve) => setTimeout(resolve, 1000 * 60));
        continue;
      }

      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  }
}
