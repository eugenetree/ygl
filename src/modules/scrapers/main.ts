import { spawnWorker as spawnVideoWorker } from "./video/bootstrap.js";
import { spawnWorker as spawnChannelWorker } from "./channel/bootstrap.js";
import { spawnWorker as spawnSearchWorker } from "./channel-discovery/bootstrap.js";
import { spawnWorker as spawnDiscoveryWorker } from "./video-discovery/bootstrap.js";
import { SearchChannelQueriesSeeder } from "./channel-discovery/search-channel-queries.seeder.js";
import { Logger } from "../_common/logger/logger.js";

const MINUTE_MS = 1000 * 60;
const HOUR_MS = MINUTE_MS * 60;

let shutdownRequested = false;

process.on("SIGTERM", () => {
  console.log("SIGTERM received, finishing current scraper and exiting...");
  shutdownRequested = true;
});

process.on("SIGINT", () => {
  console.log("SIGINT received, finishing current scraper and exiting...");
  shutdownRequested = true;
});

async function main() {
  const logger = new Logger({
    context: "scrapers-main",
    category: "main",
  });

  logger.info("Starting infinite sequential scraper loop...");

  // Seed search queries if needed
  const seeder = new SearchChannelQueriesSeeder(logger);
  const seedResult = await seeder.seedIfNeeded();
  if (!seedResult.ok) {
    logger.error({
      message: "Failed to seed search queries",
      error: seedResult.error,
    });
  }

  const scrapers = [
    { name: "Search Queries", spawn: spawnSearchWorker, timeoutMs: MINUTE_MS * 5 },
    { name: "Channel Entries", spawn: spawnChannelWorker, timeoutMs: MINUTE_MS * 5 },
    { name: "Video Discovery", spawn: spawnDiscoveryWorker, timeoutMs: MINUTE_MS * 5 },
    { name: "Video Entries", spawn: spawnVideoWorker, timeoutMs: HOUR_MS },
  ];

  while (!shutdownRequested) {
    for (const scraper of scrapers) {
      if (shutdownRequested) break;
      const scraperStartTime = Date.now();
      const timeoutMs = scraper.timeoutMs;
      const shouldContinue = () => {
        if (shutdownRequested) return false;
        const elapsed = Date.now() - scraperStartTime;
        return elapsed < timeoutMs;
      };

      const durationLabel = timeoutMs === HOUR_MS ? "1 hour" : "1 minute";
      logger.info(`Starting session for ${scraper.name} scraper (${durationLabel} limit)...`);
      try {
        await scraper.spawn({ name: "main", shouldContinue });
        const elapsed = Date.now() - scraperStartTime;
        logger.info(`${scraper.name} scraper session finished.`);

        if (elapsed < 5000 && !shutdownRequested) {
          logger.error({ message: `${scraper.name} exited too quickly (${elapsed}ms). Likely a fatal error. Exiting.` });
          process.exit(1);
        }
      } catch (err) {
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
