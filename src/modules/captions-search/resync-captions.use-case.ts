import { injectable } from "inversify";

import { ElasticCaptionsSyncRepository } from "./elastic-captions-sync.repository.js";
import { ElasticSyncService } from "./elastic-captions-sync.service.js";
import { Failure, Success } from "../../types/index.js";
import { Logger } from "../_common/logger/logger.js";

@injectable()
export class ResyncCaptionsUseCase {
  constructor(
    private readonly elasticCaptionsSyncRepository: ElasticCaptionsSyncRepository,
    private readonly elasticSyncService: ElasticSyncService,
    private readonly logger: Logger,
  ) {
    this.logger.setContext(ResyncCaptionsUseCase.name);
  }

  async execute() {
    this.logger.info("Starting full resync of captions to Elasticsearch");

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
      this.logger.info("Deleting existing captions index");
      await this.elasticSyncService.deleteIndex();

      const dataResult = await this.elasticCaptionsSyncRepository.getDataToSync();
      if (!dataResult.ok) {
        await this.elasticCaptionsSyncRepository.update(syncId, {
          syncStatus: "FAIL",
          syncCompletedAt: new Date(),
          failReason: "ERROR_GETTING_DATA_TO_SYNC",
        });
        return Failure({ type: "ERROR_GETTING_DATA_TO_SYNC", error: dataResult.error });
      }

      const captions = dataResult.value;

      if (captions.length === 0) {
        this.logger.info("No captions match sync filters after resync");
        await this.elasticCaptionsSyncRepository.update(syncId, {
          syncStatus: "SUCCESS",
          syncCompletedAt: new Date(),
          latestSyncedCaptionId: null,
        });
        return Success({ synced: 0 });
      }

      this.logger.info(`Resyncing ${captions.length} captions to Elasticsearch`);
      await this.elasticSyncService.syncDataToElastic(captions);

      const latestCaptionId = captions[captions.length - 1].id;
      await this.elasticCaptionsSyncRepository.update(syncId, {
        syncStatus: "SUCCESS",
        syncCompletedAt: new Date(),
        latestSyncedCaptionId: latestCaptionId,
      });

      this.logger.info(`Resync complete, latest caption ID: ${latestCaptionId}`);
      return Success({ synced: captions.length });
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      await this.elasticCaptionsSyncRepository.update(syncId, {
        syncStatus: "FAIL",
        syncCompletedAt: new Date(),
        failReason: reason,
      });
      throw err;
    }
  }
}
