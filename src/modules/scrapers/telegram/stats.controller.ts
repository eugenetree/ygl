import { injectable } from "inversify";
import { Telegraf } from "telegraf";

import { Logger } from "../../_common/logger/logger.js";
import { GetStatsUseCase } from "./get-stats.use-case.js";

@injectable()
export class StatsController {
  constructor(
    private readonly logger: Logger,
    private readonly getStatsUseCase: GetStatsUseCase,
  ) {
    this.logger.setContext(StatsController.name);
  }

  public register(bot: Telegraf): void {
    bot.command("stats", async (ctx) => {
      this.logger.info("Received /stats command");

      const result = await this.getStatsUseCase.execute();

      if (!result.ok) {
        this.logger.error({ message: "Failed to get stats", error: result.error });
        await ctx.reply("Failed to fetch stats. Check logs for details.");
        return;
      }

      await ctx.reply(result.value);
    });
  }
}
