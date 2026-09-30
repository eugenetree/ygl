import { injectable } from "inversify";
import { Telegraf } from "telegraf";

import { Logger } from "../_common/logger/logger.js";
import { FindCaptionsUseCase } from "../captions-search/find-captions.use-case.js";
import { TelegramController } from "./telegram-controller.js";

const MAX_RESULTS = 10;

@injectable()
export class FindController implements TelegramController {
  constructor(
    private readonly logger: Logger,
    private readonly findCaptionsUseCase: FindCaptionsUseCase,
  ) {
    this.logger.setContext(FindController.name);
  }

  public register(bot: Telegraf): void {
    bot.command("find", async (ctx) => {
      const query = ctx.message.text.split(" ").slice(1).join(" ").trim();

      if (!query) {
        await ctx.reply("Usage: /find <word or phrase>");
        return;
      }

      this.logger.info(`Received /find command with query: ${query}`);

      const result = await this.findCaptionsUseCase.execute(query, {
        offset: 0,
        limit: MAX_RESULTS,
      });

      if (!result.ok) {
        this.logger.error({
          message: "Search failed",
          error: result.error.error,
        });
        await ctx.reply("Search is unavailable right now, try again later.");
        return;
      }

      const { clips, total, isTotalExact } = result.value;

      if (clips.length === 0) {
        await ctx.reply(`No results found for: ${query}`);
        return;
      }

      const lines = clips.map((clip) => {
        const url = `https://www.youtube.com/watch?v=${clip.videoId}&t=${Math.floor(clip.playFrom / 1000)}s`;
        return `${clip.text}\n${url}`;
      });

      const header =
        total > clips.length
          ? `Showing ${clips.length} of ${total}${isTotalExact ? "" : "+"} results:\n\n`
          : "";

      await ctx.reply(`${header}${lines.join("\n\n")}`);
    });
  }
}
