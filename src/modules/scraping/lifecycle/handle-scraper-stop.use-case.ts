import { injectable } from "inversify";

import type { Logger } from "../../_common/logger/logger.js";
import type { StopReason } from "../scraper.orchestrator.js";
import type { ScraperStatusService } from "./scraper-status.service.js";

@injectable()
export class HandleScraperStopUseCase {
  constructor(
    private readonly logger: Logger,
    private readonly scraperStatusService: ScraperStatusService,
  ) {
    this.logger.setContext(HandleScraperStopUseCase.name);
  }

  public async execute(stopReason: StopReason): Promise<void> {
    if (
      stopReason.type === "GRACEFUL" ||
      stopReason.type === "QUEUE_EXHAUSTED"
    ) {
      await this.scraperStatusService.updateStatus({
        actual: "STOPPED",
        requested: "STOPPED",
      });
    }

    if (stopReason.type === "ERROR") {
      await this.scraperStatusService.updateStatus({ actual: "ERROR" });
    }
  }
}
