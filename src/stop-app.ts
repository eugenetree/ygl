import { injectable } from "inversify";
import type { ScraperCommandListener } from "./modules/scraping/lifecycle/scraper-command.listener.js";
import type { ScraperOrchestrator } from "./modules/scraping/scraper.orchestrator.js";
import type { ScraperStatusWatcher } from "./modules/telegram/scraper-status-watcher.js";
import type { TelegramBot } from "./modules/telegram/telegram-bot.js";
import type { TelegramNotifier } from "./modules/telegram/telegram-notifier.js";

@injectable()
export class StopAppUseCase {
  constructor(
    private readonly scraperOrchestrator: ScraperOrchestrator,
    private readonly telegramBot: TelegramBot,
    private readonly telegramNotifier: TelegramNotifier,
    private readonly scraperStatusWatcher: ScraperStatusWatcher,
    private readonly scraperCommandListener: ScraperCommandListener,
  ) {}

  public async execute() {
    await this.scraperOrchestrator.stop();
    await this.telegramBot.stop();
    await this.scraperStatusWatcher.stop();
    await this.scraperCommandListener.stop();

    this.telegramNotifier.sendMessage("App stopped.");
  }
}
