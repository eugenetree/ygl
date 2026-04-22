import { injectable } from "inversify";
import { Telegraf } from "telegraf";

import { Logger } from "../_common/logger/logger.js";
import { TelegramController } from "./telegram-controller.js";
import { ReprocessCaptionsUseCase } from "../scraping/scrapers/video/use-cases/reprocess-captions/reprocess-captions.use-case.js";
import { CAPTIONS_PROCESSING_ALGORITHM_VERSION } from "../scraping/scrapers/video/config.js";

const MAX_IDS_IN_MESSAGE = 50;

@injectable()
export class ReprocessCaptionsController implements TelegramController {
  constructor(
    private readonly logger: Logger,
    private readonly reprocessCaptionsUseCase: ReprocessCaptionsUseCase,
  ) {
    this.logger.setContext(ReprocessCaptionsController.name);
  }

  public register(bot: Telegraf): void {
    bot.command("reprocess_captions", async (ctx) => {
      this.logger.info("Received /reprocess_captions command");

      await ctx.reply("Captions reprocessing started. This may take a while...");

      const result = await this.reprocessCaptionsUseCase.execute();

      if (!result.ok) {
        this.logger.error({ message: "Reprocessing failed", error: result.error });
        await ctx.reply(`Reprocessing failed: ${result.error.message}`);
        return;
      }

      const { processedCount, failedCount, bothValidBefore, bothValidAfter, becameValid, becameInvalid } =
        result.value;

      if (processedCount === 0 && failedCount === 0) {
        await ctx.reply(
          `Nothing to reprocess — all videos already at version ${CAPTIONS_PROCESSING_ALGORITHM_VERSION}.`,
        );
        return;
      }

      const summary =
        `Reprocessing complete.\n` +
        `Processed: ${processedCount}, failed: ${failedCount}\n` +
        `Both CAPTIONS_VALID — before: ${bothValidBefore}, after: ${bothValidAfter}\n` +
        `Became valid: ${becameValid.length}\n` +
        `Became invalid: ${becameInvalid.length}`;

      await ctx.reply(summary);
      await this.replyWithIds((msg) => ctx.reply(msg), "Became valid (invalid → valid)", becameValid);
      await this.replyWithIds((msg) => ctx.reply(msg), "Became invalid (valid → invalid)", becameInvalid);
    });
  }

  private async replyWithIds(
    reply: (msg: string) => Promise<unknown>,
    title: string,
    ids: string[],
  ): Promise<void> {
    if (ids.length === 0) return;

    for (let i = 0; i < ids.length; i += MAX_IDS_IN_MESSAGE) {
      const chunk = ids.slice(i, i + MAX_IDS_IN_MESSAGE);
      const header = ids.length > MAX_IDS_IN_MESSAGE
        ? `${title} (${i + 1}-${i + chunk.length} of ${ids.length}):`
        : `${title}:`;
      await reply(`${header}\n${chunk.join("\n")}`);
    }
  }
}
