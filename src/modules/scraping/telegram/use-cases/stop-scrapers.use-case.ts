import { injectable } from "inversify";
import { ScraperOrchestrator } from "../../scraper.orchestrator.js";

@injectable()
export class StopScrapersUseCase {
  constructor(
    private readonly scraperOrchestrator: ScraperOrchestrator,
  ) { }

  async execute() {
    return this.scraperOrchestrator.stop();
  }
}