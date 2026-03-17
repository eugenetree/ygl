import "reflect-metadata";

import { Container } from "inversify";

import { Logger } from "../_common/logger/logger.js";
import { ElasticSyncService } from "./elastic-captions-sync.service.js";
import { ElasticCaptionsSyncRepository } from "./elastic-captions-sync.repository.js";

const resync = async () => {
  const container = new Container({ autobind: true });

  container.bind(Logger).toDynamicValue(() => {
    return new Logger({
      context: "captions-search",
      category: "elastic-resync",
    });
  });

  const syncService = container.get(ElasticSyncService);
  const repository = container.get(ElasticCaptionsSyncRepository);

  console.log("Deleting existing captions index...");
  await syncService.deleteIndex();

  console.log("Fetching all manual captions from DB...");
  const dataResult = await repository.getDataToSync();
  if (!dataResult.ok) {
    console.error("Failed to fetch captions:", dataResult.error);
    process.exit(1);
  }

  console.log(`Syncing ${dataResult.value.length} captions to Elasticsearch...`);
  await syncService.syncDataToElastic(dataResult.value);

  console.log("Resync complete.");
  process.exit(0);
};

resync();
