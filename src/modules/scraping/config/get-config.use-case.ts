import { injectable } from "inversify";
import type { ScraperConfigRepository } from "../config/scraper-config.repository.js";

@injectable()
export class GetConfigUseCase {
  constructor(
    private readonly scraperConfigRepository: ScraperConfigRepository,
  ) {}

  async execute() {
    return this.scraperConfigRepository.findAll();
  }
}
