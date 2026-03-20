import "reflect-metadata";

import { Container } from "inversify";

import { Logger } from "./modules/_common/logger/logger.js";
import { TelegramBotService } from "./modules/telegram-bot/telegram-bot.service.js";

async function main() {
  const container = new Container({ autobind: true });
  container
    .bind(Logger)
    .toDynamicValue(() => new Logger({ context: "main", category: "main" }));

  const logger = container.get(Logger);
  const bot = container.get(TelegramBotService);

  const shutdown = async (signal: string) => {
    logger.info(`${signal} received, shutting down...`);
    await bot.stop();
    process.exit(0);
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

  bot.launch();
  import("./modules/scrapers/main.js");
}

main().catch((err) => {
  console.error("Critical error in main:", err);
  process.exit(1);
});
