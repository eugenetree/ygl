import { injectable } from "inversify";
import { ScraperOrchestrator } from "../scraper.orchestrator.js";
import { ScraperStatusService } from "./scraper-status.service.js";
import { Failure } from "../../../types/index.js";

@injectable()
export class RequestScraperStopUseCase {
  constructor(
    private readonly scraperStatusGateway: ScraperStatusService,
  ) { }

  async execute() {
    const currentStatusResult = await this.scraperStatusGateway.getStatus();
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

    return this.scraperStatusGateway.updateStatus({
      requested: "STOPPED"
    });
  }
}