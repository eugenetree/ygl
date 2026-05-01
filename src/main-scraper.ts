import "reflect-metadata";

import { Container } from "inversify";

import { HttpClient, httpClient } from "./modules/_common/http/index.js";
import { Logger } from "./modules/_common/logger/logger.js";
import { TelegramNotifier } from "./modules/telegram/telegram-notifier.js";
import { ScraperOrchestrator } from "./modules/scraping/scraper.orchestrator.js";
import { ScraperCommandListener } from "./modules/scraping/lifecycle/scraper-command.listener.js";
import { ScraperHeartbeat } from "./modules/scraping/lifecycle/scraper-heartbeat.js";
import { ScraperStatusService } from "./modules/scraping/lifecycle/scraper-status.service.js";
import { StartScraperUseCase } from "./modules/scraping/lifecycle/start-scraper.use-case.js";
import { SearchChannelQueriesSeeder } from "./modules/scraping/scrapers/channel-discovery/search-channel-queries.seeder.js";
import { YtDlpClient } from "./modules/youtube-api/yt-dlp-client.js";

async function main() {
  const container = new Container({ autobind: true });
  container
    .bind(Logger)
    .toDynamicValue(() => new Logger({ context: "main-scraper", category: "main" }));
  container.bind(HttpClient).toConstantValue(httpClient);
  container.bind(YtDlpClient).toSelf().inSingletonScope();
  container.bind(ScraperOrchestrator).toSelf().inSingletonScope();

  const logger = container.get(Logger);
  const seeder = container.get(SearchChannelQueriesSeeder);
  const scraperCommandListener = container.get(ScraperCommandListener);
  const scraperOrchestrator = container.get(ScraperOrchestrator);
  const scraperStatusService = container.get(ScraperStatusService);
  const startScraperUseCase = container.get(StartScraperUseCase);
  const scraperHeartbeat = container.get(ScraperHeartbeat);
  const telegramNotifier = container.get(TelegramNotifier);

  const shutdown = async () => {
    scraperHeartbeat.stop();
    await scraperOrchestrator.stop();
    await scraperCommandListener.stop();

    const currentStatus = await scraperStatusService.getRequestedStatus();
    if (!currentStatus.ok) {
      process.exit(0);
    }

    const isAlreadyStopped = ["STOPPED", "ERROR", "KILLED"].includes(currentStatus.value);
    if (!isAlreadyStopped) {
      await scraperStatusService.updateStatus({ actual: "STOPPED" });
    }

    process.exit(0);
  };

  process.on("SIGTERM", () => shutdown());
  process.on("SIGINT", () => shutdown());

  await seeder.seedIfNeeded();
  scraperHeartbeat.start();

  // Reconcile status on startup — process may have crashed with stale RUNNING state
  await scraperStatusService.updateStatus({ actual: "STOPPED" });
  const statusResult = await scraperStatusService.getRequestedStatus();
  if (statusResult.ok && statusResult.value === "RUNNING") {
    await startScraperUseCase.execute();
  }

  await scraperCommandListener.start();

  const country = await fetchScraperCountry(logger);
  await telegramNotifier.sendMessage(`Scraper container country: ${country}`);
}

async function fetchScraperCountry(logger: Logger): Promise<string> {
  try {
    const response = await fetch("https://ipinfo.io/json", { signal: AbortSignal.timeout(5000) });
    if (!response.ok) return "unknown";
    const data = (await response.json()) as { country?: string };
    return data.country ?? "unknown";
  } catch (error) {
    logger.error({
      message: "Failed to fetch scraper country from ipinfo.io",
      error: error instanceof Error ? error : new Error(String(error)),
    });
    return "unknown";
  }
}

main().catch((err) => {
  console.error("Critical error in main-scraper:", err);
  process.exit(1);
});
