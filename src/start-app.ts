import { injectable } from "inversify";
import { ScraperOrchestrator } from "./modules/scraping/scraper.orchestrator.js";
import { TelegramBot } from "./modules/telegram/telegram-bot.js";
import { ScraperConfigRepository } from "./modules/scraping/config/scraper-config.repository.js";
import { Logger } from "./modules/_common/logger/logger.js";
import { TelegramNotifier } from "./modules/telegram/telegram-notifier.js";
import { SearchChannelQueriesSeeder } from "./modules/scraping/scrapers/channel-discovery/search-channel-queries.seeder.js";
import { ScraperStatusWatcher } from "./modules/telegram/scraper-status-watcher.js";
import { ScraperCommandListener } from "./modules/scraping/lifecycle/scraper-command.listener.js";
import { ApiServer } from "./modules/api/api-server.js";

@injectable()
export class StartAppUseCase {
  constructor(
    private readonly scraperOrchestrator: ScraperOrchestrator,
    private readonly telegramBot: TelegramBot,
    private readonly scraperConfigRepository: ScraperConfigRepository,
    private readonly logger: Logger,
    private readonly telegramNotifier: TelegramNotifier,
    private readonly searchChannelQueriesSeeder: SearchChannelQueriesSeeder,
    private readonly scraperStatusWatcher: ScraperStatusWatcher,
    private readonly scraperCommandListener: ScraperCommandListener,
    private readonly apiServer: ApiServer,
  ) { }

  public async execute() {
    this.apiServer.start();
    await this.searchChannelQueriesSeeder.seedIfNeeded();
    await this.telegramBot.start();
    await this.scraperStatusWatcher.start();
    await this.scraperCommandListener.start();

    const country = await this.fetchScraperCountry();
    this.telegramNotifier.sendMessage(
      "App started.\n"
      + `Scraper country: ${country}`
    );

    // const configResult = await this.scraperConfigRepository.findEnabled();
    // if (!configResult.ok) {
    //   return configResult;
    // }

    // const enabledScrapers =
    //   configResult.value
    //     .map((config) => config.scraperName);

    // await this.scraperOrchestrator.start(enabledScrapers);
    // this.telegramNotifier.sendMessage(`Scrapers started:\n${enabledScrapers.join("\n")}`);
  }

  private async fetchScraperCountry(): Promise<string> {
    try {
      const response = await fetch("https://ipinfo.io/json");
      if (!response.ok) {
        return "unknown";
      }
      const data = (await response.json()) as { country?: string };
      return data.country ?? "unknown";
    } catch (error) {
      this.logger.error({
        message: "Failed to fetch scraper country from ipinfo.io",
        error: error instanceof Error ? error : new Error(String(error)),
      });
      return "unknown";
    }
  }
}