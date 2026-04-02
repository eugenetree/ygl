import { injectable } from "inversify";
import { Telegraf } from "telegraf";

import { Logger } from "../_common/logger/logger.js";
import { ConfigController } from "../scraping/telegram/config.controller.js";
import { LifecycleController } from "../scraping/telegram/lifecycle.controller.js";
import { StatsController } from "../scraping/telegram/stats.controller.js";

@injectable()
export class TelegramBot {
  private bot: Telegraf;

  constructor(
    private readonly logger: Logger,
    private readonly statsController: StatsController,
    private readonly lifecycleController: LifecycleController,
    private readonly configController: ConfigController,
  ) {
    this.logger.setContext(TelegramBot.name);

    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) {
      throw new Error("TELEGRAM_BOT_TOKEN env var is required");
    }

    this.bot = new Telegraf(token);
    this.bot.catch((err, ctx) => {
      this.logger.error({ message: `Unhandled error processing update ${ctx.update.update_id}`, error: err });
    });
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
    this.lifecycleController.register(this.bot);
    this.statsController.register(this.bot);
    this.configController.register(this.bot);
  }

  public async start(): Promise<void> {
    this.logger.info("Launching Telegram bot with long polling...");
    await new Promise<void>((resolve) => {
      this.bot.launch({}, resolve);
    });
    this.logger.info("Telegram bot is running.");
  }

  public async stop(): Promise<void> {
    this.logger.info("Stopping Telegram bot...");
    this.bot.stop();
    this.logger.info("Telegram bot stopped.");
  }
}
