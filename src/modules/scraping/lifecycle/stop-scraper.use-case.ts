import { injectable } from "inversify";
import { Logger } from "../../_common/logger/logger.js";
import { ScraperOrchestrator } from "../scraper.orchestrator.js";

@injectable()
export class StopScraperUseCase {
  private readonly logger: Logger;

  constructor(
    logger: Logger,
    private readonly scraperOrchestrator: ScraperOrchestrator,
  ) {
    this.logger = logger.child({ context: StopScraperUseCase.name });
  }

  async execute() {
    this.logger.info("Executing scraper stop due to requested status change.");

    if (!this.scraperOrchestrator.getIsRunning()) {
      this.logger.warn("Scraper orchestrator is already stopped internally. Ignoring stop request.");
      return;
    }

    const result = await this.scraperOrchestrator.stop();
    if (!result.ok) {
      this.logger.error({ message: "Failed to stop orchestrator gracefully", error: result.error });
    }

    this.logger.info("Scrapers execution successfully stopped.");
  }
}
