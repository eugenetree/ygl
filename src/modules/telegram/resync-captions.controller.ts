import { injectable } from "inversify";
import { Telegraf } from "telegraf";

import { Logger } from "../_common/logger/logger.js";
import { TelegramController } from "./telegram-controller.js";
import { ResyncCaptionsUseCase } from "../captions-search/resync-captions.use-case.js";

@injectable()
export class ResyncCaptionsController implements TelegramController {
  constructor(
    private readonly logger: Logger,
    private readonly resyncCaptionsUseCase: ResyncCaptionsUseCase,
  ) {
    this.logger.setContext(ResyncCaptionsController.name);
  }

  public register(bot: Telegraf): void {
    bot.command("resync_captions", async (ctx) => {
      this.logger.info("Received /resync_captions command");

      await ctx.reply("Caption resync started. This may take a while...");

      const result = await this.resyncCaptionsUseCase.execute();

      if (!result.ok) {
        this.logger.error({ message: "Resync failed", error: result.error });
        await ctx.reply(`Resync failed: ${result.error.type}`);
        return;
      }

      await ctx.reply(`Resync complete. Synced ${result.value.synced} captions.`);
    });
  }
}
