import { injectable } from "inversify";
import { ScrapingProcessStatus } from "../../db/types.js";
import { Logger } from "../_common/logger/logger.js";
import { TelegramNotifier } from "./telegram-notifier.js";

type Status = ScrapingProcessStatus | "PROCESS_DOWN";

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
    instanceId,
    oldStatus,
    newStatus,
  }: {
    instanceId: string;
    oldStatus: Status;
    newStatus: Status;
  }) {
    if (oldStatus === newStatus) {
      this.logger.error({
        message: "Scraper status is the same as before",
        context: { instanceId, oldStatus, newStatus },
      });
      return;
    }

    const message = messageToStatus[newStatus];
    if (!message) {
      return;
    }
    await this.telegramNotifier.sendMessage(`[${instanceId}] ${message}`);
  }
}
