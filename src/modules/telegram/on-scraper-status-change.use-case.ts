import { injectable } from "inversify";
import { Status } from "../scraping/lifecycle/scraper-status.service.js";
import { TelegramNotifier } from "./telegram-notifier.js";
import { Logger } from "../_common/logger/logger.js";

const messageToStatus: Partial<Record<Status, string>> = {
  RUNNING: "Scrapers started.",
  STOPPED: "Scrapers stopped.",
  IDLE: "Scrapers are idle.",
  ERROR: "Scrapers stopped with an error.",
  KILLED: "Scrapers were killed.",
};

@injectable()
export class OnScraperStatusChangeUseCase {
  constructor(
    private readonly logger: Logger,
    private readonly telegramNotifier: TelegramNotifier,
  ) {
    this.logger.setContext(OnScraperStatusChangeUseCase.name);
  }

  async execute({
    oldStatus,
    newStatus
  }: {
    oldStatus: Status,
    newStatus: Status
  }) {
    if (oldStatus === newStatus) {
      this.logger.error({
        message: "Scraper status is the same as before",
        context: {
          oldStatus,
          newStatus
        }
      })

      return;
    }

    const message = messageToStatus[newStatus];
    if (!message) { return }
    await this.telegramNotifier.sendMessage(message);
  }
}