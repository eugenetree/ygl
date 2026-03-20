import { injectable } from "inversify";

import { Failure, Result, Success } from "../../../types/index.js";
import { Logger } from "../logger/logger.js";
import { BaseError } from "../errors.js";

type TelegramNotificationError = BaseError & {
  type: "TELEGRAM_NOTIFICATION_ERROR";
  cause: unknown;
};

@injectable()
export class TelegramNotificationService {
  private readonly botToken: string;
  private readonly chatId: string;

  constructor(private readonly logger: Logger) {
    this.logger.setContext(TelegramNotificationService.name);
    this.botToken = process.env.TELEGRAM_BOT_TOKEN ?? "";
    this.chatId = process.env.TELEGRAM_CHAT_ID ?? "";
  }

  public async sendMessage(
    text: string,
  ): Promise<Result<void, TelegramNotificationError>> {
    const url = `https://api.telegram.org/bot${this.botToken}/sendMessage`;

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: this.chatId,
          text,
        }),
      });

      if (!response.ok) {
        const data = await response.text();
        this.logger.error({
          message: `Telegram API returned ${response.status}`,
          error: new Error(data),
        });
        return Failure({
          type: "TELEGRAM_NOTIFICATION_ERROR" as const,
          cause: data,
        });
      }

      return Success(undefined);
    } catch (error) {
      this.logger.error({
        message: "Failed to send Telegram message",
        error: error instanceof Error ? error : new Error(String(error)),
      });
      return Failure({
        type: "TELEGRAM_NOTIFICATION_ERROR" as const,
        cause: error,
      });
    }
  }
}
