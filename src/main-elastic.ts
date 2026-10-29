import "reflect-metadata";

import { Container } from "inversify";
import { DatabaseClient } from "./db/client.js";
import { Logger } from "./modules/_common/logger/logger.js";
import { TASKS } from "./modules/_common/messaging/definitions.js";
import { MessagingConnection } from "./modules/_common/messaging/messaging-connection.js";
import { TaskQueue } from "./modules/_common/messaging/task-queue.js";
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
  container.bind(MessagingConnection).toSelf().inSingletonScope();

  const logger = container.get(Logger);
  const messagingConnection = container.get(MessagingConnection);
  const taskQueue = container.get(TaskQueue);
  const searchSyncLoop = container.get(SearchSyncLoop);
  const rebuildSearchIndexUseCase = container.get(RebuildSearchIndexUseCase);

  const shutdown = async () => {
    logger.info("Shutting down elastic process");
    searchSyncLoop.stop();
    await messagingConnection.stop();
    process.exit(0);
  };

  process.on("SIGTERM", () => shutdown());
  process.on("SIGINT", () => shutdown());

  await messagingConnection.start();
  await taskQueue.work(TASKS.REBUILD_SEARCH_INDEX, (signal) =>
    searchSyncLoop.runBetweenPasses(() =>
      rebuildSearchIndexUseCase.execute(signal),
    ),
  );

  logger.info("Elastic sync process started, running first sync...");
  searchSyncLoop.start();
}

main().catch((err) => {
  console.error("Critical error in main-elastic:", err);
  process.exit(1);
});
