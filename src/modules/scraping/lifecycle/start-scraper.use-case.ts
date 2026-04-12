import { injectable } from "inversify";
import { Logger } from "../../_common/logger/logger.js";
import { ScraperOrchestrator } from "../scraper.orchestrator.js";
import { ScraperConfigRepository } from "../config/scraper-config.repository.js";
import { ScraperStatusService } from "./scraper-status.service.js";

@injectable()
export class StartScraperUseCase {
  private readonly logger: Logger;

  constructor(
    logger: Logger,
    private readonly scraperOrchestrator: ScraperOrchestrator,
    private readonly scraperConfigRepository: ScraperConfigRepository,
    private readonly scraperStatusService: ScraperStatusService,
  ) {
    this.logger = logger.child({ context: StartScraperUseCase.name });
  }

  async execute() {
    this.logger.info("Executing scraper start due to requested status change.");

    if (this.scraperOrchestrator.getIsRunning()) {
      this.logger.warn("Scraper orchestrator is already running internally. Ignoring restart request.");
      await this.scraperStatusService.updateStatus({ actual: "RUNNING" });
      return;
    }

    const configResult = await this.scraperConfigRepository.findEnabled();
    if (!configResult.ok) {
      this.logger.error({ message: "Failed to fetch scraper config for start execution", error: configResult.error });
      return;
    }

    const scrapersToRun = configResult.value.map(c => c.scraperName);

    if (scrapersToRun.length === 0) {
      this.logger.warn("No scrapers enabled to run.");
      await this.scraperStatusService.updateStatus({ actual: "STOPPED" });
      return;
    }

    const result = await this.scraperOrchestrator.start(scrapersToRun);
    if (!result.ok) {
      this.logger.error({ message: "Failed to start orchestrator", error: result.error });
      return;
    }

    await this.scraperStatusService.updateStatus({ actual: "RUNNING" });
    this.logger.info(`Scrapers execution successfully started with: ${scrapersToRun.join(", ")}`);
  }
}
