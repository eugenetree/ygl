import { injectable } from "inversify";
import { Telegraf } from "telegraf";
import { Logger } from "../_common/logger/logger.js";
import {
  PushChannelResult,
  PushChannelUseCase,
} from "../scraping/push-channel/push-channel.use-case.js";
import { TelegramController } from "./telegram-controller.js";

@injectable()
export class PushChannelController implements TelegramController {
  constructor(
    private readonly logger: Logger,
    private readonly pushChannelUseCase: PushChannelUseCase,
  ) {
    this.logger.setContext(PushChannelController.name);
  }

  public register(bot: Telegraf): void {
    bot.command("push_channel", async (ctx) => {
      const channelId = ctx.message.text.split(" ")[1]?.trim();

      if (!channelId) {
        await ctx.reply("Usage: /push_channel <channelId>");
        return;
      }

      this.logger.info(`Received /push_channel command for ${channelId}`);
      await ctx.reply(`Pushing channel ${channelId} with priority...`);

      const result = await this.pushChannelUseCase.execute(channelId);

      if (!result.ok) {
        this.logger.error({
          message: "Push channel failed",
          error: result.error,
        });
        await ctx.reply(`Failed: ${result.error.error.message}`);
        return;
      }

      await ctx.reply(this.buildMessage(channelId, result.value));
    });
  }

  private buildMessage(channelId: string, result: PushChannelResult): string {
    if (result.status === "ADDED") {
      return `Channel ${channelId} was added to the scraping flow and prioritized.`;
    }

    const updated: string[] = [];
    if (result.updatedChannelJobs > 0)
      updated.push(`${result.updatedChannelJobs} channel job(s)`);
    if (result.updatedVideoDiscoveryJobs > 0)
      updated.push(
        `${result.updatedVideoDiscoveryJobs} video discovery job(s)`,
      );
    if (result.updatedVideoJobs > 0)
      updated.push(`${result.updatedVideoJobs} video job(s)`);

    if (updated.length === 0) {
      return `Channel ${channelId} is fully processed — no pending jobs to prioritize.`;
    }

    return `Channel ${channelId} prioritized. Updated: ${updated.join(", ")}.`;
  }
}
