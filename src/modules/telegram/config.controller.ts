import { injectable } from "inversify";
import { Telegraf } from "telegraf";
import { Logger } from "../_common/logger/logger.js";
import { GetConfigUseCase } from "../scraping/config/get-config.use-case.js";
import { ScraperConfig } from "../scraping/config/scraper-config.js";
import { ToggleScraperUseCase } from "../scraping/config/toggle-scraper.use-case.js";
import { ScraperName } from "../scraping/constants.js";
import { InstanceRegistry } from "../scraping/instance-registry/instance-registry.js";
import { TelegramController } from "./telegram-controller.js";

const SCRAPER_NAMES = [
  ScraperName.CHANNEL_DISCOVERY,
  ScraperName.CHANNEL,
  ScraperName.VIDEO_DISCOVERY,
  ScraperName.VIDEO,
] as const;

function buildConfigKeyboard(instanceId: string, rows: ScraperConfig[]) {
  const configMap = new Map(rows.map((r) => [r.scraperName, r.enabled]));
  return SCRAPER_NAMES.map((name) => {
    const enabled = configMap.get(name) ?? false;
    return [
      {
        text: `[${enabled ? "on" : "off"}] ${name}`,
        callback_data: `toggle_${instanceId}_${name}`,
      },
    ];
  });
}

@injectable()
export class ConfigController implements TelegramController {
  constructor(
    private readonly logger: Logger,
    private readonly instanceRegistry: InstanceRegistry,
    private readonly toggleScraperUseCase: ToggleScraperUseCase,
    private readonly getConfigUseCase: GetConfigUseCase,
  ) {
    this.logger.setContext(ConfigController.name);
  }

  public register(bot: Telegraf): void {
    bot.command("config", async (ctx) => {
      this.logger.info("Received /config command");

      const listResult = await this.instanceRegistry.list();
      if (!listResult.ok) {
        await ctx.reply("Failed to load instances.");
        return;
      }

      if (listResult.value.length === 0) {
        await ctx.reply("No scraper instances registered.");
        return;
      }

      await ctx.reply("Select instance to configure:", {
        reply_markup: {
          inline_keyboard: listResult.value.map((instance) => [
            {
              text: instance.instanceId,
              callback_data: `config_instance_${instance.instanceId}`,
            },
          ]),
        },
      });
    });

    bot.action(/^config_instance_(.+)$/, async (ctx) => {
      const instanceId = ctx.match[1];
      await ctx.answerCbQuery();

      const result = await this.getConfigUseCase.execute(instanceId);
      if (!result.ok) {
        await ctx.reply("Failed to load scraper config.");
        return;
      }

      await ctx.reply(`Scraper Config — ${instanceId}`, {
        reply_markup: {
          inline_keyboard: buildConfigKeyboard(instanceId, result.value),
        },
      });
    });

    bot.action(/^toggle_([^_]+)_(.+)$/, async (ctx) => {
      const instanceId = ctx.match[1];
      const scraperName = ctx.match[2];

      if (!this.isScraperName(scraperName)) {
        await ctx.answerCbQuery("Unknown scraper.");
        return;
      }

      const toggleResult = await this.toggleScraperUseCase.execute(
        instanceId,
        scraperName,
      );
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

      await ctx.editMessageReplyMarkup({
        inline_keyboard: buildConfigKeyboard(
          instanceId,
          toggleResult.value.allConfigs,
        ),
      });
      await ctx.answerCbQuery();

      const state = toggleResult.value.updatedConfig.enabled
        ? "enabled"
        : "disabled";
      await ctx.reply(`[${instanceId}] ${scraperName} ${state}.`);
    });
  }

  private isScraperName(scraperName: string): scraperName is ScraperName {
    return SCRAPER_NAMES.includes(
      scraperName as (typeof SCRAPER_NAMES)[number],
    );
  }
}
