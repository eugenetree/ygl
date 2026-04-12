import { injectable } from "inversify";
import { ScraperOrchestrator } from "./modules/scraping/scraper.orchestrator.js";
import { TelegramBot } from "./modules/telegram/telegram-bot.js";
import { ScraperConfigRepository } from "./modules/scraping/config/scraper-config.repository.js";
import { Logger } from "./modules/_common/logger/logger.js";
import { TelegramNotifier } from "./modules/telegram/telegram-notifier.js";
import { SearchChannelQueriesSeeder } from "./modules/scraping/scrapers/channel-discovery/search-channel-queries.seeder.js";
import { ScraperStatusWatcher } from "./modules/telegram/scraper-status-watcher.js";
import { ScraperCommandListener } from "./modules/scraping/lifecycle/scraper-command.listener.js";

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
  ) { }

  public async execute() {
    await this.searchChannelQueriesSeeder.seedIfNeeded();
    await this.telegramBot.start();
    await this.scraperStatusWatcher.start();
    await this.scraperCommandListener.start();

    this.telegramNotifier.sendMessage("App started.");

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
}