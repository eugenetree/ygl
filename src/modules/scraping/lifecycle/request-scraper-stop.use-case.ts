import { injectable } from "inversify";
import { Failure } from "../../../types/index.js";
import { ScraperOrchestrator } from "../scraper.orchestrator.js";
import type { ScraperStatusService } from "./scraper-status.service.js";

@injectable()
export class RequestScraperStopUseCase {
  constructor(private readonly scraperStatusService: ScraperStatusService) {}

  async execute() {
    const currentStatusResult =
      await this.scraperStatusService.getActualStatus();
    if (!currentStatusResult.ok) {
      return currentStatusResult;
    }

    const currentStatus = currentStatusResult.value;
    if (currentStatus === "IDLE") {
      return Failure({
        type: "SCRAPER_IDLE",
      } as const);
    }

    if (currentStatus === "KILLED") {
      return Failure({
        type: "SCRAPER_KILLED",
      } as const);
    }

    if (currentStatus === "STOPPED") {
      return Failure({
        type: "SCRAPER_ALREADY_STOPPED",
      } as const);
    }

    return this.scraperStatusService.updateStatus({
      requested: "STOPPED",
    });
  }
}
