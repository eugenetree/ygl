import { injectable } from "inversify";
import { Telegraf } from "telegraf";
import { Logger } from "../_common/logger/logger.js";
import { RecalculateAllPrioritiesUseCase } from "../scraping/channel-priority/recalculate-all-priorities.use-case.js";
import { TelegramController } from "./telegram-controller.js";

@injectable()
export class RecalculatePriorityController implements TelegramController {
  constructor(
    private readonly logger: Logger,
    private readonly recalculateAllPrioritiesUseCase: RecalculateAllPrioritiesUseCase,
  ) {
    this.logger.setContext(RecalculatePriorityController.name);
  }

  public register(bot: Telegraf): void {
    bot.command("recalculate_priority", async (ctx) => {
      this.logger.info("Received /recalculate_priority command");
      await ctx.reply("Recalculating priority scores for all channels...");

      const result = await this.recalculateAllPrioritiesUseCase.execute();

      await ctx.reply(
        `Done. Recalculated: ${result.total}, failed: ${result.failed}.`,
      );
    });
  }
}
