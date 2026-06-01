import { injectable } from "inversify";
import { Failure } from "../../../types/index.js";
import { ScraperConfigRepository } from "../config/scraper-config.repository.js";
import { ScraperOrchestrator } from "../scraper.orchestrator.js";
import type { ScraperStatusService } from "./scraper-status.service.js";

@injectable()
export class RequestScraperStartUseCase {
  constructor(private readonly scraperStatusService: ScraperStatusService) {}

  async execute() {
    const currentStatusResult =
      await this.scraperStatusService.getActualStatus();
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

    return this.scraperStatusService.updateStatus({
      requested: "RUNNING",
    });
  }
}
