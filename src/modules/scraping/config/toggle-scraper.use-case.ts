import { injectable } from "inversify";
import { ScraperConfigRepository } from "../config/scraper-config.repository.js";
import { ScraperName } from "../constants.js";
import { Failure, Success } from "../../../types/index.js";

@injectable()
export class ToggleScraperUseCase {
  constructor(
    private readonly scraperConfigRepository: ScraperConfigRepository,
  ) { }

  async execute(scraperName: ScraperName) {
    const configResult = await this.scraperConfigRepository.findByName(scraperName);
    if (!configResult.ok) {
      return configResult;
    }

    if (!configResult.value) {
      return Failure({
        type: "NOT_FOUND",
        message: "Scraper not found",
      } as const);
    }

    const currentConfig = configResult.value;
    const updatedConfig = { ...currentConfig, enabled: !currentConfig.enabled };

    const updateResult = await this.scraperConfigRepository.update(updatedConfig);
    if (!updateResult.ok) {
      return updateResult;
    }

    const allConfigsResult = await this.scraperConfigRepository.findAll();
    if (!allConfigsResult.ok) {
      return allConfigsResult;
    }

    return Success({
      updatedConfig: updateResult.value,
      allConfigs: allConfigsResult.value,
    });
  }
}