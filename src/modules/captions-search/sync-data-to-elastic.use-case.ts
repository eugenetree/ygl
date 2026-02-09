import { ElasticCaptionsSyncRepository } from "./elastic-captions-sync.repository.js";
import { Failure, Success } from "../../types/index.js";
import { Logger } from "../_common/logger/logger.js";
import { injectable } from "inversify";
import { ElasticSyncService } from "./elastic-captions-sync.service.js";

@injectable()
export class SyncDataToElasticUseCase {
  constructor(
    private readonly elasticCaptionsSyncRepository: ElasticCaptionsSyncRepository,
    private readonly logger: Logger,
    private readonly elasticSyncService: ElasticSyncService,
  ) {
    this.logger.setContext(SyncDataToElasticUseCase.name);
  }

  async execute() {
    this.logger.info("Starting sync data to elastic");
    const lastSyncResult = await this.elasticCaptionsSyncRepository.getLastSuccessfulSync();
    if (!lastSyncResult.ok) {
      return Failure({
        type: "ERROR_GETTING_LAST_SYNC",
        error: lastSyncResult.error,
      })
    }

    const lastSync = lastSyncResult.value;
    if (!lastSync) {
      console.log("No last successful sync found, starting full sync");
      this.logger.info("No last successful sync found, starting full sync");
      await this.performFullSync();
      return;
    }

    const lastSyncedCaptionId = lastSync.latestSyncedCaptionId;
    if (!lastSyncedCaptionId) {
      this.logger.error({
        message: "No last synced caption ID in last successful sync, unexpected state.",
        context: { lastSync },
      });

      throw new Error("Should not happen");
    }

    await this.performIncrementalSync(lastSyncedCaptionId);
  }

  private async performIncrementalSync(lastSyncedCaptionId: string) {
    const dataToSyncResult = await this.elasticCaptionsSyncRepository.getDataToSync(lastSyncedCaptionId);
    if (!dataToSyncResult.ok) {
      return Failure({
        type: "ERROR_GETTING_DATA_TO_SYNC",
        error: dataToSyncResult.error,
      });
    }

    const dataToSync = dataToSyncResult.value;

    return Success(dataToSync);
  }

  private async performFullSync() {
    this.logger.info("Starting full sync");

    const dataToSyncResult = await this.elasticCaptionsSyncRepository.getDataToSync();

    if (!dataToSyncResult.ok) {
      console.log("Error getting data to sync", dataToSyncResult.error);

      return Failure({
        type: "ERROR_GETTING_DATA_TO_SYNC",
        error: dataToSyncResult.error,
      });
    }


    console.log("Got data to sync", dataToSyncResult.value.length);
    const dataToSync = dataToSyncResult.value;
    await this.elasticSyncService.syncDataToElastic(dataToSync);

    return Success(dataToSync);
  }
}