import "reflect-metadata";

import { Container } from "inversify";
import { DatabaseClient } from "./db/client.js";
import { Logger } from "./modules/_common/logger/logger.js";
import { rebuildSearchIndex } from "./modules/_common/tasks/task-definitions.js";
import { Tasks } from "./modules/_common/tasks/tasks.js";
import { RebuildSearchIndexUseCase } from "./modules/captions-search/rebuild-search-index.use-case.js";
import { SearchSyncLoop } from "./modules/captions-search/search-sync-loop.js";

async function main() {
  const container = new Container({ autobind: true });
  container
    .bind(Logger)
    .toDynamicValue(
      () => new Logger({ context: "main-elastic", category: "main" }),
    );
  container.bind(DatabaseClient).toSelf().inSingletonScope();
  container.bind(Tasks).toSelf().inSingletonScope();

  const logger = container.get(Logger);
  const tasks = container.get(Tasks);
  const searchSyncLoop = container.get(SearchSyncLoop);
  const rebuildSearchIndexUseCase = container.get(RebuildSearchIndexUseCase);

  const shutdown = async () => {
    logger.info("Shutting down elastic process");
    searchSyncLoop.stop();
    await tasks.stop();
    process.exit(0);
  };

  process.on("SIGTERM", () => shutdown());
  process.on("SIGINT", () => shutdown());

  await tasks.start();
  await tasks.work(rebuildSearchIndex, (_data, signal) =>
    searchSyncLoop.runBetweenPasses(async () => {
      const result = await rebuildSearchIndexUseCase.execute(signal);
      if (!result.ok) {
        throw result.error.error;
      }
      return result.value;
    }),
  );

  logger.info("Elastic sync process started, running first sync...");
  searchSyncLoop.start();
}

main().catch((err) => {
  console.error("Critical error in main-elastic:", err);
  process.exit(1);
});
