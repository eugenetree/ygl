import { injectable } from "inversify";

import { Logger } from "../../_common/logger/logger.js";
import { StopReason } from "../scraper.orchestrator.js";
import { ScraperStatusService } from "./scraper-status.service.js";

@injectable()
export class HandleScraperStopUseCase {
  constructor(
    private readonly logger: Logger,
    private readonly scraperStatusGateway: ScraperStatusService,
  ) {
    this.logger.setContext(HandleScraperStopUseCase.name);
  }

  public async execute(stopReason: StopReason): Promise<void> {
    if (stopReason.type === "GRACEFUL" || stopReason.type === "QUEUE_EXHAUSTED") {
      await this.scraperStatusGateway.updateStatus({ actual: "STOPPED" });
    }

    if (stopReason.type === "ERROR") {
      await this.scraperStatusGateway.updateStatus({ actual: "ERROR" });
    }
  }
}