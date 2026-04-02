import { injectable } from "inversify";
import { ScraperOrchestrator } from "./modules/scraping/scraper.orchestrator.js";
import { TelegramBot } from "./modules/telegram/telegram-bot.js";
import { TelegramNotifier } from "./modules/telegram/telegram-notifier.js";

@injectable()
export class StopAppUseCase {
  constructor(
    private readonly scraperOrchestrator: ScraperOrchestrator,
    private readonly telegramBot: TelegramBot,
    private readonly telegramNotifier: TelegramNotifier,
  ) { }

  public async execute() {
    await this.scraperOrchestrator.stop();
    await this.telegramBot.stop();

    this.telegramNotifier.sendMessage("App stopped.");
  }
}