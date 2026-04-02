import { injectable } from "inversify";
import { Telegraf } from "telegraf";

import { Logger } from "../../_common/logger/logger.js";
import { ScraperOrchestrator } from "../scraper.orchestrator.js";
import { JobStats, StatsRepository } from "../stats.repository.js";
import { TelegramController } from "../../telegram/telegram-controller.js";

@injectable()
export class StatsController implements TelegramController {
  constructor(
    private readonly logger: Logger,
    private readonly statsRepository: StatsRepository,
    private readonly scraperOrchestrator: ScraperOrchestrator,
  ) {
    this.logger.setContext(StatsController.name);
  }

  public register(bot: Telegraf): void {
    bot.command("stats", async (ctx) => {
      this.logger.info("Received /stats command");

      const result = await this.statsRepository.getStats();

      if (!result.ok) {
        this.logger.error({ message: "Failed to get stats", error: result.error });
        await ctx.reply("Failed to fetch stats. Check logs for details.");
        return;
      }

      await ctx.reply(this.formatMessage(result.value));
    });
  }

  private formatMessage(stats: JobStats): string {
    const stateLabel = this.scraperOrchestrator.getIsRunning() ? "running" : "stopped";

    const formatLine = (label: string, counts: Record<string, number>) => {
      return `${label}:\npending=${counts.PENDING}\nprocessing=${counts.PROCESSING}\nsucceeded=${counts.SUCCEEDED}\nfailed=${counts.FAILED}`;
    };

    return [
      `State: ${stateLabel}`,
      "",
      formatLine("Channel Discovery", stats.channelDiscovery),
      "",
      formatLine("Channel", stats.channel),
      "",
      formatLine("Video Discovery", stats.videoDiscovery),
      "",
      formatLine("Video", stats.video),
      "",
      formatLine("Transcription", stats.transcription),
      "",
      `Videos with valid captions: ${stats.videosWithValidManualCaptions}`,
    ].join("\n");
  }
}
