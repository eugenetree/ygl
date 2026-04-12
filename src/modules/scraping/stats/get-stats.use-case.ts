import { injectable } from "inversify";
import { JobStats, StatsRepository } from "./stats.repository.js";
import { ScraperStatusService, Status } from "../lifecycle/scraper-status.service.js";

@injectable()
export class GetStatsUseCase {
  constructor(
    private readonly statsRepository: StatsRepository,
    private readonly scraperStatusGateway: ScraperStatusService,
  ) { }

  async execute() {
    const [statsResult, scrapingStatusResult] = await Promise.all([
      this.statsRepository.getStats(),
      this.scraperStatusGateway.getStatus(),
    ]);

    const result: {
      stats?: JobStats,
      scrapingStatus?: Status
    } = {};

    if (statsResult.ok) {
      result.stats = statsResult.value;
    }

    if (scrapingStatusResult.ok) {
      result.scrapingStatus = scrapingStatusResult.value;
    }

    return result;
  }
}