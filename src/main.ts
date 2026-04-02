import "reflect-metadata";

import { Container } from "inversify";

import { httpClient, HttpClient } from "./modules/_common/http/index.js";
import { Logger } from "./modules/_common/logger/logger.js";
import { ScraperOrchestrator } from "./modules/scraping/scraper.orchestrator.js";
import { TelegramBot } from "./modules/telegram/telegram-bot.js";
import { YtDlpClient } from "./modules/youtube-api/yt-dlp-client.js";
import { StartAppUseCase } from "./start-app.js";
import { StopAppUseCase } from "./stop-app.js";

async function main() {
  const container = new Container({ autobind: true });
  container
    .bind(Logger)
    .toDynamicValue(() => new Logger({ context: "main", category: "main" }));
  container.bind(HttpClient).toConstantValue(httpClient);
  container.bind(YtDlpClient).toSelf().inSingletonScope();
  container.bind(TelegramBot).toSelf().inSingletonScope();
  container.bind(ScraperOrchestrator).toSelf().inSingletonScope();

  const startApp = container.get(StartAppUseCase);
  const stopApp = container.get(StopAppUseCase);

  const shutdown = async (signal: string) => {
    await stopApp.execute();
    process.exit(0);
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

  await startApp.execute();
}

main().catch((err) => {
  console.error("Critical error in main:", err);
  process.exit(1);
});