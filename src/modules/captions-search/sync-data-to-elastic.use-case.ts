import { ElasticCaptionsSyncRepository } from "./elastic-captions-sync.repository.js";
import { Failure, Success } from "../../types/index.js";
import { Logger } from "../_common/logger/logger.js";
import { injectable } from "inversify";
import { ElasticSyncService } from "./elastic-captions-sync.service.js";
import { CaptionsRow } from "../../db/types.js";
import { Selectable } from "kysely";

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

    const syncIdResult = await this.elasticCaptionsSyncRepository.create({
      syncStatus: "IN_PROGRESS",
      syncStartedAt: new Date(),
    });

    if (!syncIdResult.ok) {
      this.logger.error({ message: "Failed to insert sync record", error: syncIdResult.error });
      return Failure({ type: "DATABASE", error: syncIdResult.error });
    }

    const syncId = syncIdResult.value;

    try {
      const lastSyncResult = await this.elasticCaptionsSyncRepository.getLastSuccessfulSync();
      if (!lastSyncResult.ok) {
        await this.elasticCaptionsSyncRepository.update(syncId, {
          syncStatus: "FAIL",
          syncCompletedAt: new Date(),
          failReason: "ERROR_GETTING_LAST_SYNC",
        });
        return Failure({ type: "DATABASE", error: lastSyncResult.error });
      }

      const lastSync = lastSyncResult.value;

      let captions: Selectable<CaptionsRow>[];
      if (!lastSync || !lastSync.latestSyncedCaptionId) {
        this.logger.info("No last successful sync found, starting full sync");
        const dataResult = await this.elasticCaptionsSyncRepository.getDataToSync();
        if (!dataResult.ok) {
          await this.elasticCaptionsSyncRepository.update(syncId, { syncStatus: "FAIL", syncCompletedAt: new Date(), failReason: "ERROR_GETTING_DATA_TO_SYNC" });
          return Failure({ type: "ERROR_GETTING_DATA_TO_SYNC", error: dataResult.error });
        }
        captions = dataResult.value;
      } else {
        const dataResult = await this.elasticCaptionsSyncRepository.getDataToSync(lastSync.latestSyncedCaptionId);
        if (!dataResult.ok) {
          await this.elasticCaptionsSyncRepository.update(syncId, { syncStatus: "FAIL", syncCompletedAt: new Date(), failReason: "ERROR_GETTING_DATA_TO_SYNC" });
          return Failure({ type: "ERROR_GETTING_DATA_TO_SYNC", error: dataResult.error });
        }
        captions = dataResult.value;
      }

      if (captions.length === 0) {
        this.logger.info("No new captions to sync");
        await this.elasticCaptionsSyncRepository.update(syncId, { syncStatus: "SUCCESS", syncCompletedAt: new Date(), latestSyncedCaptionId: lastSync?.latestSyncedCaptionId ?? null });
        return Success({ synced: 0 });
      }

      this.logger.info(`Syncing ${captions.length} captions to Elasticsearch`);
      await this.elasticSyncService.syncDataToElastic(captions);

      const latestCaptionId = captions[captions.length - 1].id;
      await this.elasticCaptionsSyncRepository.update(syncId, { syncStatus: "SUCCESS", syncCompletedAt: new Date(), latestSyncedCaptionId: latestCaptionId });

      this.logger.info(`Sync complete, latest caption ID: ${latestCaptionId}`);
      return Success({ synced: captions.length });
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      await this.elasticCaptionsSyncRepository.update(syncId, { syncStatus: "FAIL", syncCompletedAt: new Date(), failReason: reason });
      throw err;
    }
  }
}
