import { injectable } from "inversify";
import { Telegraf } from "telegraf";

import { Logger } from "../_common/logger/logger.js";
import { InstanceRegistry } from "../scraping/instance-registry/instance-registry.js";
import { RequestScraperStartUseCase } from "../scraping/lifecycle/request-scraper-start.use-case.js";
import { RequestScraperStopUseCase } from "../scraping/lifecycle/request-scraper-stop.use-case.js";
import { TelegramController } from "./telegram-controller.js";

@injectable()
export class LifecycleController implements TelegramController {
  constructor(
    private readonly logger: Logger,
    private readonly instanceRegistry: InstanceRegistry,
    private readonly requestScraperStartUseCase: RequestScraperStartUseCase,
    private readonly requestScraperStopUseCase: RequestScraperStopUseCase,
  ) {
    this.logger.setContext(LifecycleController.name);
  }

  public register(bot: Telegraf): void {
    bot.command("start", async (ctx) => {
      this.logger.info("Received /start command");

      const listResult = await this.instanceRegistry.list();
      if (!listResult.ok) {
        await ctx.reply("Failed to load instances.");
        return;
      }

      if (listResult.value.length === 0) {
        await ctx.reply("No scraper instances registered.");
        return;
      }

      await ctx.reply("Select instance to start:", {
        reply_markup: {
          inline_keyboard: listResult.value.map((instance) => [
            {
              text: instance.instanceId,
              callback_data: `start_instance_${instance.instanceId}`,
            },
          ]),
        },
      });
    });

    bot.action(/^start_instance_(.+)$/, async (ctx) => {
      const instanceId = ctx.match[1];
      await ctx.answerCbQuery();

      const result = await this.requestScraperStartUseCase.execute(instanceId);
      if (!result.ok) {
        switch (result.error.type) {
          case "SCRAPER_ALREADY_RUNNING":
            await ctx.reply(`${instanceId} is already running.`);
            return;

          case "SCRAPER_KILLED":
            await ctx.reply(
              `${instanceId} was killed. Please restart it manually.`,
            );
            return;

          case "DATABASE":
            await ctx.reply("Issue with database.");
            return;
        }
      }

      await ctx.reply(
        `${instanceId}: start requested.\n` +
          "You'll receive a notification once scraping starts.",
      );
    });

    bot.command("stop", async (ctx) => {
      this.logger.info("Received /stop command");

      const listResult = await this.instanceRegistry.list();
      if (!listResult.ok) {
        await ctx.reply("Failed to load instances.");
        return;
      }

      if (listResult.value.length === 0) {
        await ctx.reply("No scraper instances registered.");
        return;
      }

      await ctx.reply("Select instance to stop:", {
        reply_markup: {
          inline_keyboard: listResult.value.map((instance) => [
            {
              text: instance.instanceId,
              callback_data: `stop_instance_${instance.instanceId}`,
            },
          ]),
        },
      });
    });

    bot.action(/^stop_instance_(.+)$/, async (ctx) => {
      const instanceId = ctx.match[1];
      await ctx.answerCbQuery();

      const result = await this.requestScraperStopUseCase.execute(instanceId);
      if (!result.ok) {
        switch (result.error.type) {
          case "SCRAPER_IDLE":
            await ctx.reply(`${instanceId} is not running.`);
            return;

          case "SCRAPER_KILLED":
            await ctx.reply(
              `${instanceId} was killed. Please restart it manually.`,
            );
            return;

          case "SCRAPER_ALREADY_STOPPED":
            await ctx.reply(`${instanceId} is already stopped.`);
            return;

          case "DATABASE":
            await ctx.reply("Issue with database.");
            return;
        }
      }

      await ctx.reply(
        `${instanceId}: stop requested.\n` +
          "You'll receive a notification once scraping stops.",
      );
    });
  }
}
