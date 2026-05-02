import { injectable } from "inversify";
import { Telegraf } from "telegraf";

import { Logger } from "../_common/logger/logger.js";
import { TelegramController } from "./telegram-controller.js";
import { GetLastScrapedVideosUseCase } from "../scraping/scrapers/video/use-cases/get-last-scraped-videos.use-case.js";

const LIMIT = 10;

@injectable()
export class LastVideosController implements TelegramController {
  constructor(
    private readonly logger: Logger,
    private readonly getLastScrapedVideosUseCase: GetLastScrapedVideosUseCase,
  ) {
    this.logger.setContext(LastVideosController.name);
  }

  public register(bot: Telegraf): void {
    bot.command("last", async (ctx) => {
      this.logger.info("Received /last command");

      const result = await this.getLastScrapedVideosUseCase.execute(LIMIT);

      if (!result.ok) {
        await ctx.reply("Failed to load last scraped videos.");
        return;
      }

      if (result.value.length === 0) {
        await ctx.reply("No videos scraped yet.");
        return;
      }

      const lines = result.value.map((v) => {
        const url = `https://www.youtube.com/watch?v=${v.id}`;
        const lang = v.languageCode ?? "-";
        const langYtdlp = v.languageCodeYtdlp ?? "-";
        return `${v.id} | lang=${lang} | ytdlp=${langYtdlp}\n${url}\n${v.createdAt}`;
      });

      await ctx.reply(`Last ${result.value.length} scraped videos:\n\n${lines.join("\n\n")}`);
    });
  }
}
