import { injectable } from "inversify";
import { Telegraf } from "telegraf";

import { Logger } from "../_common/logger/logger.js";
import { TelegramController } from "./telegram-controller.js";
import { RequestScraperStartUseCase } from "../scraping/lifecycle/request-scraper-start.use-case.js";
import { RequestScraperStopUseCase } from "../scraping/lifecycle/request-scraper-stop.use-case.js";

@injectable()
export class LifecycleController implements TelegramController {
  constructor(
    private readonly logger: Logger,
    private readonly requestScraperStartUseCase: RequestScraperStartUseCase,
    private readonly requestScraperStopUseCase: RequestScraperStopUseCase,
  ) {
    this.logger.setContext(LifecycleController.name);
  }

  public register(bot: Telegraf): void {
    bot.command("start", async (ctx) => {
      this.logger.info("Received /start command");

      const result = await this.requestScraperStartUseCase.execute();
      if (!result.ok) {
        switch (result.error.type) {
          case "SCRAPER_ALREADY_RUNNING":
            await ctx.reply("Scrapers are already running.");
            return;

          case "DATABASE":
            await ctx.reply("Issue with database.");
            return;
        }
      }

      await ctx.reply(
        "Scrapers start was requested.\n" +
        "You'll receive notification once scraping process starts."
      );
    });

    bot.command("stop", async (ctx) => {
      this.logger.info("Received /stop command");

      const result = await this.requestScraperStopUseCase.execute();

      if (!result.ok) {
        switch (result.error.type) {
          case "SCRAPER_IDLE":
            await ctx.reply("Scrapers are not running.");
            return;

          case "SCRAPER_KILLED":
            await ctx.reply("Scrapers were killed. Please restart them manually.");
            return;

          case "SCRAPER_ALREADY_STOPPED":
            await ctx.reply("Scrapers are already stopped.");
            return;

          case "DATABASE":
            await ctx.reply("Issue with database.");
            return;
        }
      }

      await ctx.reply(
        "Scrapers stop was requested.\n" +
        "You'll receive notification once scraping process stops."
      );
    });
  }
}
