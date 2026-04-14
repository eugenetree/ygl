import { injectable } from "inversify";
import { Telegraf } from "telegraf";

import { Logger } from "../_common/logger/logger.js";
import { TelegramController } from "./telegram-controller.js";
import { ScraperName } from "../scraping/constants.js";
import { ScraperConfigRepository } from "../scraping/config/scraper-config.repository.js";
import type { ScraperConfigRow } from "../../db/types.js";
import { GetConfigUseCase } from "../scraping/config/get-config.use-case.js";
import { ToggleScraperUseCase } from "../scraping/config/toggle-scraper.use-case.js";

const SCRAPER_NAMES = [
  ScraperName.CHANNEL_DISCOVERY,
  ScraperName.CHANNEL,
  ScraperName.VIDEO_DISCOVERY,
  ScraperName.VIDEO,
] as const;

function buildKeyboard(rows: ScraperConfigRow[]) {
  const configMap = new Map(rows.map((r) => [r.scraperName, r.enabled]));
  return SCRAPER_NAMES.map((name) => {
    const enabled = configMap.get(name) ?? true;
    return [{ text: `[${enabled ? "on" : "off"}] ${name}`, callback_data: `toggle_${name}` }];
  });
}

@injectable()
export class ConfigController implements TelegramController {
  constructor(
    private readonly logger: Logger,
    private readonly scraperConfigRepository: ScraperConfigRepository,
    private readonly toggleScraperUseCase: ToggleScraperUseCase,
    private readonly getConfigUseCase: GetConfigUseCase,
  ) {
    this.logger.setContext(ConfigController.name);
  }

  public register(bot: Telegraf): void {
    bot.command("config", async (ctx) => {
      this.logger.info("Received /config command");

      const result = await this.getConfigUseCase.execute();
      if (!result.ok) {
        await ctx.reply("Failed to load scraper config.");
        return;
      }

      await ctx.reply("Scraper Config", {
        reply_markup: { inline_keyboard: buildKeyboard(result.value) },
      });
    });

    bot.action(/^toggle_(.+)$/, async (ctx) => {
      const scraperName = ctx.match[1];

      if (!this.isScraperName(scraperName)) {
        await ctx.answerCbQuery("Unknown scraper.");
        return;
      }

      const toggleResult = await this.toggleScraperUseCase.execute(scraperName);
      if (!toggleResult.ok) {
        switch (toggleResult.error.type) {
          case "NOT_FOUND":
            await ctx.answerCbQuery("Scraper not found.");
            return;

          case "DATABASE":
            await ctx.answerCbQuery("Database error.");
            return;
        }
      }

      await ctx.editMessageReplyMarkup({ inline_keyboard: buildKeyboard(toggleResult.value.allConfigs) });
      await ctx.answerCbQuery();

      const state = toggleResult.value.updatedConfig.enabled ? "enabled" : "disabled";
      await ctx.reply(`${scraperName} ${state}.\nRestart scrapers to apply changes.`);
    });
  }

  private isScraperName(scraperName: string): scraperName is ScraperName {
    return SCRAPER_NAMES.includes(scraperName as typeof SCRAPER_NAMES[number]);
  }
}
