import "reflect-metadata";

import { Container } from "inversify";

import { Logger } from "./modules/_common/logger/logger.js";
import { SyncDataToElasticUseCase } from "./modules/captions-search/sync-data-to-elastic.use-case.js";

const SYNC_INTERVAL_MS = 60_000;

async function main() {
  const container = new Container({ autobind: true });
  container.bind(Logger).toDynamicValue(() => new Logger({ context: "main-elastic", category: "main" }));

  const logger = container.get(Logger);
  const syncUseCase = container.get(SyncDataToElasticUseCase);

  let stopped = false;
  let syncTimeout: NodeJS.Timeout | null = null;

  const shutdown = () => {
    logger.info("Shutting down elastic process");
    stopped = true;
    if (syncTimeout) clearTimeout(syncTimeout);
    process.exit(0);
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);

  const runSync = async () => {
    try {
      const result = await syncUseCase.execute();
      if (result && result.ok) {
        logger.info(`Sync done: ${result.value.synced} captions synced`);
      }
    } catch (err) {
      logger.error({ message: "Sync failed", error: err });
    }

    if (!stopped) {
      syncTimeout = setTimeout(runSync, SYNC_INTERVAL_MS);
    }
  };

  logger.info("Elastic sync process started, running first sync...");
  await runSync();
}

main().catch((err) => {
  console.error("Critical error in main-elastic:", err);
  process.exit(1);
});
