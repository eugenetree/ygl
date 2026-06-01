import { injectable } from "inversify";
import type {
  ScraperStatusService,
  Status,
} from "../lifecycle/scraper-status.service.js";
import type { JobStats, StatsRepository } from "./stats.repository.js";

@injectable()
export class GetStatsUseCase {
  constructor(
    private readonly statsRepository: StatsRepository,
    private readonly scraperStatusService: ScraperStatusService,
  ) {}

  async execute() {
    const [statsResult, scrapingStatusResult] = await Promise.all([
      this.statsRepository.getStats(),
      this.scraperStatusService.getActualStatus(),
    ]);

    const result: {
      stats?: JobStats;
      scrapingStatus?: Status;
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
