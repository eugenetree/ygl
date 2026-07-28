import { injectable } from "inversify";
import { Context, Telegraf } from "telegraf";

import { Logger } from "../_common/logger/logger.js";
import { GetChannelPrioritiesUseCase } from "../scraping/channel-priority/get-channel-priorities.use-case.js";
import { formatChannelPriorities } from "./channel-priorities.formatter.js";
import { TelegramController } from "./telegram-controller.js";

const LIMIT = 10;

@injectable()
export class ChannelPrioritiesController implements TelegramController {
  constructor(
    private readonly logger: Logger,
    private readonly getChannelPrioritiesUseCase: GetChannelPrioritiesUseCase,
  ) {
    this.logger.setContext(ChannelPrioritiesController.name);
  }

  public register(bot: Telegraf): void {
    bot.command("priority_all", (ctx) => this.reply(ctx, false));
    bot.command("priority_active", (ctx) => this.reply(ctx, true));
  }

  private async reply(ctx: Context, onlyActive: boolean): Promise<void> {
    const command = onlyActive ? "/priority_active" : "/priority_all";
    this.logger.info(`Received ${command} command`);

    const result = await this.getChannelPrioritiesUseCase.execute({
      onlyActive,
      limit: LIMIT,
    });

    if (!result.ok) {
      this.logger.error({
        message: `${command} failed`,
        error: result.error,
      });
      await ctx.reply("Failed to load channel priorities.");
      return;
    }

    await ctx.reply(formatChannelPriorities(result.value, { onlyActive }), {
      parse_mode: "HTML",
      // Without this Telegram expands the first channel link into a preview
      // card, burying the listing.
      link_preview_options: { is_disabled: true },
    });
  }
}
