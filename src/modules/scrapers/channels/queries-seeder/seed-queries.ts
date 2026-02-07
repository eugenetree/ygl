import { Logger } from "../../../_common/logger/logger.js";
import { SearchChannelQueriesSeeder } from "./search-channel-queries.seeder.js";

async function seedQueries() {
  const logger = new Logger({ context: "seed-queries" });
  const seeder = new SearchChannelQueriesSeeder(logger);

  logger.info("Starting query seeding process...");

  const result = await seeder.seedIfNeeded();

  if (!result.ok) {
    logger.error({ error: result.error });
    process.exit(1);
  }

  logger.info("Query seeding completed successfully");
  process.exit(0);
}

seedQueries().catch((error) => {
  console.error("Failed to seed queries:", error);
  process.exit(1);
});
