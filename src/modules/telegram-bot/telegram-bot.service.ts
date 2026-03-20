import { injectable } from "inversify";
import { Telegraf } from "telegraf";

import { Logger } from "../_common/logger/logger.js";
import { StatsController } from "../scrapers/telegram/stats.controller.js";

@injectable()
export class TelegramBotService {
  private bot: Telegraf;

  constructor(
    private readonly logger: Logger,
    private readonly statsController: StatsController,
  ) {
    this.logger.setContext(TelegramBotService.name);

    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) {
      throw new Error("TELEGRAM_BOT_TOKEN env var is required");
    }

    this.bot = new Telegraf(token);
    this.setupAuthMiddleware();
    this.registerControllers();
  }

  private setupAuthMiddleware(): void {
    const allowedChatId = process.env.TELEGRAM_CHAT_ID;
    if (!allowedChatId) {
      throw new Error("TELEGRAM_CHAT_ID env var is required");
    }

    this.bot.use(async (ctx, next) => {
      if (String(ctx.chat?.id) !== allowedChatId) {
        this.logger.warn(`Rejected message from unauthorized chat ${ctx.chat?.id}`);
        return;
      }
      return next();
    });
  }

  private registerControllers(): void {
    this.statsController.register(this.bot);
  }

  public async launch(): Promise<void> {
    this.logger.info("Launching Telegram bot with long polling...");
    await this.bot.launch();
    this.logger.info("Telegram bot is running.");
  }

  public async stop(): Promise<void> {
    this.logger.info("Stopping Telegram bot...");
    this.bot.stop();
    this.logger.info("Telegram bot stopped.");
  }
}
