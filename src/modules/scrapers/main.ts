import "reflect-metadata";

import { Container } from "inversify";

import { httpClient, HttpClient } from "../_common/http/index.js";
import { Logger } from "../_common/logger/logger.js";
import { BaseError } from "../_common/errors.js";
import { YtDlpClient } from "../youtube-api/yt-dlp-client.js";
import { ProcessScraperFailureUseCase } from "./_common/process-scraper-failure.use-case.js";
import { SearchChannelQueriesWorker } from "./channel-discovery/search-channel-queries.worker.js";
import { SearchChannelQueriesSeeder } from "./channel-discovery/search-channel-queries.seeder.js";
import { ChannelEntriesWorker } from "./channel/channel-entries.worker.js";
import { ChannelsWorker } from "./video-discovery/channels.worker.js";
import { VideoEntriesWorker } from "./video/video-entries.worker.js";
import { SCRAPER_NAME, ScraperName, WORKER_STOP_CAUSE } from "./constants.js";

const MINUTE_MS = 1000 * 60;
const HOUR_MS = MINUTE_MS * 60;

let shutdownRequested = false;
let workerRunning = false;

function requestShutdown(signal: string) {
  shutdownRequested = true;

  if (!workerRunning) {
    console.log(`${signal} received, no worker running. Exiting.`);
    process.exit(0);
  }

  console.log(`${signal} received, waiting for current worker to finish...`);
}

process.on("SIGTERM", () => requestShutdown("SIGTERM"));
process.on("SIGINT", () => requestShutdown("SIGINT"));

async function main() {
  const container = new Container({ autobind: true });
  container.bind(Logger).toDynamicValue(() => new Logger({ context: "scrapers", category: "main" }));
  container.bind(HttpClient).toConstantValue(httpClient);
  container.bind(YtDlpClient).toSelf().inSingletonScope();

  const logger = container.get(Logger);

  logger.info("Starting infinite sequential scraper loop...");

  // Seed search queries if needed
  const seeder = container.get(SearchChannelQueriesSeeder);
  const seedResult = await seeder.seedIfNeeded();
  if (!seedResult.ok) {
    logger.error({
      message: "Failed to seed search queries",
      error: seedResult.error,
    });
  }

  const processScraperFailure = container.get(ProcessScraperFailureUseCase);

  const createOnError = (scraperName: ScraperName) => {
    return async (error: BaseError) => {
      await processScraperFailure.execute({ scraperName, error });
    };
  };

  const scrapers = [
    { name: "Search Queries", workerClass: SearchChannelQueriesWorker, timeoutMs: MINUTE_MS * 5, onError: createOnError(SCRAPER_NAME.CHANNEL_DISCOVERY) },
    { name: "Channel Entries", workerClass: ChannelEntriesWorker, timeoutMs: MINUTE_MS * 5, onError: createOnError(SCRAPER_NAME.CHANNEL) },
    { name: "Video Discovery", workerClass: ChannelsWorker, timeoutMs: MINUTE_MS * 5, onError: createOnError(SCRAPER_NAME.VIDEO_DISCOVERY) },
    { name: "Video Entries", workerClass: VideoEntriesWorker, timeoutMs: HOUR_MS, onError: createOnError(SCRAPER_NAME.VIDEO) },
  ];

  while (!shutdownRequested) {
    for (const scraper of scrapers) {
      if (shutdownRequested) {
        logger.info("Shutdown requested, exiting...");
        return;
      }

      const scraperStartTime = Date.now();
      const timeoutMs = scraper.timeoutMs;

      const shouldContinue = () => {
        if (shutdownRequested) return false;
        const elapsed = Date.now() - scraperStartTime;
        return elapsed < timeoutMs;
      };

      logger.info(`Starting session for ${scraper.name} scraper (${timeoutMs}ms limit)...`);

      try {
        const worker = container.get(scraper.workerClass);
        workerRunning = true;
        const result = await worker.run({ shouldContinue, onError: scraper.onError });
        workerRunning = false;
        const elapsed = Date.now() - scraperStartTime;

        if (!result.ok) {
          logger.error({ message: `${scraper.name} scraper session failed.`, error: result.error });
          process.exit(1);
        }

        logger.info(`${scraper.name} scraper session finished (${result.value}).`);

        if (result.value === WORKER_STOP_CAUSE.EMPTY) {
          logger.error({ message: `${scraper.name} exited because queue is empty. Exiting.` });
          process.exit(1);
        }
      } catch (err) {
        workerRunning = false;
        logger.error({
          message: `Critical error during ${scraper.name} scraper session`,
          error: err,
        });
        return;
      }
    }

    logger.info("Cycle finished. Starting over...");
  }

  logger.info("Shutdown complete.");
}

main().catch((err) => {
  console.error("Critical error in scrapers main:", err);
  process.exit(1);
});
