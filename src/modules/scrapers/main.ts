import { spawnWorker as spawnVideoWorker } from "./video/bootstrap.js";
import { spawnWorker as spawnChannelWorker } from "./channel/bootstrap.js";
import { spawnWorker as spawnSearchWorker } from "./channel-discovery/bootstrap.js";
import { spawnWorker as spawnDiscoveryWorker } from "./video-discovery/bootstrap.js";
import { SearchChannelQueriesSeeder } from "./channel-discovery/search-channel-queries.seeder.js";
import { Logger } from "../_common/logger/logger.js";

const MINUTE_MS = 1000 * 60;
const HOUR_MS = MINUTE_MS * 60;

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
    { name: "Channel Entries", spawn: spawnChannelWorker, timeoutMs: MINUTE_MS },
    { name: "Video Entries", spawn: spawnVideoWorker, timeoutMs: HOUR_MS },
    { name: "Search Queries", spawn: spawnSearchWorker, timeoutMs: MINUTE_MS },
    { name: "Video Discovery", spawn: spawnDiscoveryWorker, timeoutMs: MINUTE_MS },
  ];

  while (true) {
    for (const scraper of scrapers) {
      const scraperStartTime = Date.now();
      const timeoutMs = scraper.timeoutMs;
      const shouldContinue = () => {
        const elapsed = Date.now() - scraperStartTime;
        return elapsed < timeoutMs;
      };

      const durationLabel = timeoutMs === HOUR_MS ? "1 hour" : "1 minute";
      logger.info(`Starting session for ${scraper.name} scraper (${durationLabel} limit)...`);
      try {
        await scraper.spawn({ name: "main", shouldContinue });
        logger.info(`${scraper.name} scraper session finished.`);
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
}

main().catch((err) => {
  console.error("Critical error in scrapers main:", err);
  process.exit(1);
});
