import { injectable } from "inversify";
import { ScraperOrchestrator } from "../../scraper.orchestrator.js";
import { ScraperConfigRepository } from "../../config/scraper-config.repository.js";

@injectable()
export class StartScrapersUseCase {
  constructor(
    private readonly scraperConfigRepository: ScraperConfigRepository,
    private readonly scraperOrchestrator: ScraperOrchestrator,
  ) { }

  async execute() {
    const configResult = await this.scraperConfigRepository.findEnabled();
    if (!configResult.ok) {
      return configResult;
    }

    const enabledScrapers =
      configResult.value
        .map((config) => config.scraperName);

    return this.scraperOrchestrator.start(enabledScrapers);
  }
}