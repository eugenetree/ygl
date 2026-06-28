import { injectable } from "inversify";
import { Context } from "telegraf";
import { Telegraf } from "telegraf";
import { Logger } from "../_common/logger/logger.js";
import { TopChannel } from "../scraping/channel-priority/channel-priority.service.js";
import { GetTopChannelsByPriorityUseCase } from "../scraping/channel-priority/get-top-channels-by-priority.use-case.js";
import { TelegramController } from "./telegram-controller.js";

function formatSubscriberCount(count: number | null): string {
  if (count === null) return "?";
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${Math.round(count / 1_000)}k`;
  return String(count);
}

function formatChannel(ch: TopChannel, rank: number): string {
  const score = ch.scrapingScore.toFixed(2);
  const subs = formatSubscriberCount(ch.subscriberCount);
  return `${rank}. ${ch.name} — score: ${score} | subs: ${subs} | videos: ${ch.processedCount}/${ch.totalCount}`;
}

@injectable()
export class PriorityController implements TelegramController {
  constructor(
    private readonly logger: Logger,
    private readonly getTopChannelsByPriorityUseCase: GetTopChannelsByPriorityUseCase,
  ) {
    this.logger.setContext(PriorityController.name);
  }

  public register(bot: Telegraf): void {
    bot.command("priority_all", async (ctx) => {
      this.logger.info("Received /priority_all command");
      await this.handleCommand(ctx, false);
    });

    bot.command("priority_active", async (ctx) => {
      this.logger.info("Received /priority_active command");
      await this.handleCommand(ctx, true);
    });
  }

  private async handleCommand(
    ctx: Context,
    activeOnly: boolean,
  ): Promise<void> {
    const result = await this.getTopChannelsByPriorityUseCase.execute({
      activeOnly,
    });

    if (!result.ok) {
      await ctx.reply("Failed to load channels.");
      return;
    }

    if (result.value.length === 0) {
      await ctx.reply(
        activeOnly ? "No active channels found." : "No channels found.",
      );
      return;
    }

    const lines = result.value.map((ch, i) => formatChannel(ch, i + 1));
    const header = activeOnly
      ? "Top active channels by priority:"
      : "Top channels by priority:";

    await ctx.reply(`${header}\n\n${lines.join("\n")}`);
  }
}
