import { injectable } from "inversify";
import { Telegraf } from "telegraf";

import { Logger } from "../_common/logger/logger.js";
import { TelegramController } from "./telegram-controller.js";
import { FindCaptionsUseCase } from "../captions-search/find-captions.use-case.js";

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

      const hits = await this.findCaptionsUseCase.execute(query);

      if (hits.length === 0) {
        await ctx.reply(`No results found for: ${query}`);
        return;
      }

      const lines = hits.slice(0, MAX_RESULTS).map((hit) => {
        const source = hit._source as { videoId: string; startTime: number; text: string };
        const url = `https://www.youtube.com/watch?v=${source.videoId}&t=${Math.floor((source.startTime - 1000) / 1000)}s`;
        return `${source.text}\n${url}`;
      });

      await ctx.reply(lines.join("\n\n"));
    });
  }
}
