import { injectable } from "inversify";
import { Telegraf } from "telegraf";
import fs from "fs";

import { Logger } from "../_common/logger/logger.js";
import { TelegramController } from "./telegram-controller.js";
import { ExportLogsUseCase } from "../scraping/logs/export-logs.use-case.js";

@injectable()
export class ExportLogsController implements TelegramController {
  constructor(
    private readonly logger: Logger,
    private readonly exportLogsUseCase: ExportLogsUseCase,
  ) {
    this.logger.setContext(ExportLogsController.name);
  }

  public register(bot: Telegraf): void {
    bot.command("logs", async (ctx) => {
      this.logger.info("Received /logs command");

      const result = await this.exportLogsUseCase.execute();

      if (!result.ok) {
        this.logger.error({ message: "Failed to export logs", error: result.error });
        await ctx.reply(result.error.message);
        return;
      }

      const { zipPath } = result.value;

      try {
        await ctx.replyWithDocument({ source: zipPath, filename: "logs.zip" });
        this.logger.info(`Successfully sent logs zip: ${zipPath}`);
      } catch (error) {
        this.logger.error({ message: "Failed to send logs via Telegram", error });
        await ctx.reply("Failed to send logs via Telegram.");
      } finally {
        if (fs.existsSync(zipPath)) {
          try {
            fs.unlinkSync(zipPath);
          } catch (unlinkError) {
            this.logger.error({ message: "Failed to delete temporary zip file", error: unlinkError });
          }
        }
      }
    });
  }
}
