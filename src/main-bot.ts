import "reflect-metadata";

import { Container } from "inversify";

import { HttpClient, httpClient } from "./modules/_common/http/index.js";
import { Logger } from "./modules/_common/logger/logger.js";
import { TelegramBot } from "./modules/telegram/telegram-bot.js";
import { ScraperStatusWatcher } from "./modules/telegram/scraper-status-watcher.js";
import { TelegramNotifier } from "./modules/telegram/telegram-notifier.js";

async function main() {
  const container = new Container({ autobind: true });
  container
    .bind(Logger)
    .toDynamicValue(() => new Logger({ context: "main-bot", category: "main" }));
  container.bind(HttpClient).toConstantValue(httpClient);
  container.bind(TelegramBot).toSelf().inSingletonScope();

  const telegramBot = container.get(TelegramBot);
  const scraperStatusWatcher = container.get(ScraperStatusWatcher);
  const telegramNotifier = container.get(TelegramNotifier);

  const shutdown = async () => {
    await telegramBot.stop();
    await scraperStatusWatcher.stop();
    process.exit(0);
  };

  process.on("SIGTERM", () => shutdown());
  process.on("SIGINT", () => shutdown());

  await telegramBot.start();
  await scraperStatusWatcher.start();

  telegramNotifier.sendMessage("Bot started.");
}

main().catch((err) => {
  console.error("Critical error in main-bot:", err);
  process.exit(1);
});
