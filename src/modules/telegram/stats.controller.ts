import { injectable } from "inversify";
import { Telegraf } from "telegraf";

import { Logger } from "../_common/logger/logger.js";
import { JobStats } from "../scraping/stats/stats.repository.js";
import { TelegramController } from "./telegram-controller.js";
import { GetStatsUseCase } from "../scraping/stats/get-stats.use-case.js";
import { Status } from "../scraping/lifecycle/scraper-status.service.js";

@injectable()
export class StatsController implements TelegramController {
  constructor(
    private readonly logger: Logger,
    private readonly getStatsUseCase: GetStatsUseCase,
  ) {
    this.logger.setContext(StatsController.name);
  }

  public register(bot: Telegraf): void {
    bot.command("stats", async (ctx) => {
      this.logger.info("Received /stats command");

      const { stats, scrapingStatus } = await this.getStatsUseCase.execute();

      if (!stats || !scrapingStatus) {
        await ctx.reply(
          `Issue with fetching stats.\n` +
          `Scraper state: ${scrapingStatus}\n` +
          `Stats: ${JSON.stringify(stats, null, 2)}`
        );
        return;
      }

      const message =
        `Scraper state: ${scrapingStatus}\n\n` +
        `${this.formatLine("Channel Discovery", stats.channelDiscovery)}\n\n` +
        `${this.formatLine("Channel", stats.channel)}\n\n` +
        `${this.formatLine("Video Discovery", stats.videoDiscovery)}\n\n` +
        `${this.formatLine("Video", stats.video)}\n\n` +
        `${this.formatLine("Transcription", stats.transcription)}\n\n` +
        `Videos with valid captions: ${stats.videosWithValidManualCaptions}`;

      await ctx.reply(message);
    });
  }

  private formatLine(label: string, counts: Record<string, number>) {
    return `${label}:\npending=${counts.PENDING}\nprocessing=${counts.PROCESSING}\nsucceeded=${counts.SUCCEEDED}\nfailed=${counts.FAILED}`;
  }
}
