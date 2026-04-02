import { injectable } from "inversify";

import { Result, Success } from "../../../types/index.js";
import { BaseError } from "../../_common/errors.js";
import { Logger } from "../../_common/logger/logger.js";
import { TelegramNotifier } from "../../telegram/telegram-notifier.js";
import { ScraperName } from "../constants.js";

@injectable()
export class ProcessScraperFailureUseCase {
  constructor(
    private readonly logger: Logger,
    private readonly telegramNotificationService: TelegramNotifier,
  ) {
    this.logger.setContext(ProcessScraperFailureUseCase.name);
  }

  public async execute({
    scraperName,
    error,
  }: {
    scraperName: ScraperName;
    error: BaseError;
  }): Promise<Result<void, BaseError>> {
    const message = this.formatMessage(scraperName, error);

    const result = await this.telegramNotificationService.sendMessage(message);

    if (!result.ok) {
      this.logger.error({
        message: "Failed to deliver Telegram notification",
        error: result.error,
        context: { scraperName },
      });
    }

    return Success(undefined);
  }

  private formatMessage(scraperName: string, error: BaseError): string {
    const details = JSON.stringify(error, null, 2);
    return `🚨 Scraper failure: ${scraperName}\n\nError type: ${error.type}\nDetails:\n${details}`;
  }
}
