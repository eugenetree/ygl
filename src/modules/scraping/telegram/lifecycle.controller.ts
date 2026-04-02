import { injectable } from "inversify";
import { Telegraf } from "telegraf";

import { Logger } from "../../_common/logger/logger.js";
import { TelegramController } from "../../telegram/telegram-controller.js";
import { StartScrapersUseCase } from "./use-cases/start-scrapers.use-case.js";
import { StopScrapersUseCase } from "./use-cases/stop-scrapers.use-case.js";

@injectable()
export class LifecycleController implements TelegramController {
  constructor(
    private readonly logger: Logger,
    private readonly startScrapersUseCase: StartScrapersUseCase,
    private readonly stopScrapersUseCase: StopScrapersUseCase,
  ) {
    this.logger.setContext(LifecycleController.name);
  }

  public register(bot: Telegraf): void {
    bot.command("start", async (ctx) => {
      this.logger.info("Received /start command");

      const result = await this.startScrapersUseCase.execute();
      if (!result.ok) {
        switch (result.error.type) {
          case "ScraperAlreadyRunningError":
            await ctx.reply("Scrapers are already running.");
            return;

          case "DATABASE":
            await ctx.reply("Issue with database.");
            return;
        }
      }

      await ctx.reply("Scrapers started.");
    });

    bot.command("stop", async (ctx) => {
      this.logger.info("Received /stop command");

      ctx.reply("Stopping scrapers.\nWaiting for current item to finish.");
      const result = await this.stopScrapersUseCase.execute();

      if (!result.ok) {
        switch (result.error.type) {
          case "ScraperNotRunningError":
            await ctx.reply("Scrapers are not running.");
            return;
        }
      }

      await ctx.reply("Scrapers stopped.");
    });

    bot.command("restart", async (ctx) => {
      this.logger.info("Received /restart command");

      ctx.reply("Stopping scrapers.\nWaiting for current item to finish.");
      const stopResult = await this.stopScrapersUseCase.execute();
      if (!stopResult.ok) {
        switch (stopResult.error.type) {
          case "ScraperNotRunningError":
            await ctx.reply("Scrapers are not running.\nStarting them.");
            break;
        }
      }

      if (stopResult.ok) {
        await ctx.reply("Scrapers stopped.");
      }

      const startResult = await this.startScrapersUseCase.execute();
      if (!startResult.ok) {
        switch (startResult.error.type) {
          case "ScraperAlreadyRunningError":
            await ctx.reply("Scrapers are already running.");
            return;

          case "DATABASE":
            await ctx.reply("Issue with database.");
            return;
        }
      }

      await ctx.reply("Scrapers started with updated config.");
    });
  }
}
