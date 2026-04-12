import { injectable } from "inversify";
import { ScraperOrchestrator } from "../scraper.orchestrator.js";
import { ScraperConfigRepository } from "../config/scraper-config.repository.js";
import { ScraperStatusService } from "./scraper-status.service.js";
import { Failure } from "../../../types/index.js";

@injectable()
export class RequestScraperStartUseCase {
  constructor(
    private readonly scraperStatusGateway: ScraperStatusService,
  ) { }

  async execute() {
    const currentStatusResult = await this.scraperStatusGateway.getStatus();
    if (!currentStatusResult.ok) {
      return currentStatusResult;
    }

    const currentStatus = currentStatusResult.value;
    if (currentStatus === "RUNNING") {
      return Failure({
        type: "SCRAPER_ALREADY_RUNNING",
      } as const);
    }

    if (currentStatus === "KILLED") {
      return Failure({
        type: "SCRAPER_KILLED",
      } as const);
    }

    return this.scraperStatusGateway.updateStatus({
      requested: "RUNNING"
    });
  }
}