import { injectable } from "inversify";

import { Logger } from "../_common/logger/logger.js";
import { StopReason } from "./scraper.orchestrator.js";
import { TelegramNotifier } from "../telegram/telegram-notifier.js";

@injectable()
export class OnScraperStopUseCase {
  constructor(
    private readonly logger: Logger,
    private readonly telegramNotifier: TelegramNotifier,
  ) {
    this.logger.setContext(OnScraperStopUseCase.name);
  }

  public async execute(stopReason: StopReason): Promise<void> {
    this.telegramNotifier.sendMessage(
      'Scraper loop stopped.\n' +
      `Reason: ${stopReason.type}`
    );
  }
}