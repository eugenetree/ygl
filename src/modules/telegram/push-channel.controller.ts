import { injectable } from "inversify";
import { Telegraf } from "telegraf";
import { Logger } from "../_common/logger/logger.js";
import { TelegramController } from "./telegram-controller.js";
import { PushChannelUseCase } from "../scraping/push-channel/push-channel.use-case.js";

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
        this.logger.error({ message: "Push channel failed", error: result.error });
        await ctx.reply(`Failed: ${result.error.error.message}`);
        return;
      }

      await ctx.reply(result.value.message);
    });
  }
}
