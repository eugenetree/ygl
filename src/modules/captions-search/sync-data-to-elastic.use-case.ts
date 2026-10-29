import { injectable } from "inversify";
import { Failure, Success } from "../../types/index.js";
import { Logger } from "../_common/logger/logger.js";
import {
  type CaptionToIndex,
  ElasticCaptionsSyncRepository,
} from "./elastic-captions-sync.repository.js";
import { toSearchIndexDocument } from "./search-index-document.js";
import {
  BULK_BATCH_SIZE,
  SEARCH_INDEX,
  SearchIndexes,
} from "./search-indexes.js";

@injectable()
export class SyncDataToElasticUseCase {
  constructor(
    private readonly elasticCaptionsSyncRepository: ElasticCaptionsSyncRepository,
    private readonly searchIndexes: SearchIndexes,
    private readonly logger: Logger,
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
      this.logger.error({
        message: "Failed to insert sync record",
        error: syncIdResult.error,
      });
      return Failure({ type: "DATABASE", error: syncIdResult.error });
    }

    const syncId = syncIdResult.value;

    try {
      const lastSyncResult =
        await this.elasticCaptionsSyncRepository.getLastSuccessfulSync();
      if (!lastSyncResult.ok) {
        await this.elasticCaptionsSyncRepository.update(syncId, {
          syncStatus: "FAIL",
          syncCompletedAt: new Date(),
          failReason: "ERROR_GETTING_LAST_SYNC",
        });
        return Failure({ type: "DATABASE", error: lastSyncResult.error });
      }

      const lastSync = lastSyncResult.value;

      let captions: CaptionToIndex[];
      if (!lastSync || !lastSync.latestSyncedCaptionId) {
        this.logger.info("No last successful sync found, starting full sync");
        const dataResult =
          await this.elasticCaptionsSyncRepository.getDataToSync();
        if (!dataResult.ok) {
          await this.elasticCaptionsSyncRepository.update(syncId, {
            syncStatus: "FAIL",
            syncCompletedAt: new Date(),
            failReason: "ERROR_GETTING_DATA_TO_SYNC",
          });
          return Failure({
            type: "ERROR_GETTING_DATA_TO_SYNC",
            error: dataResult.error,
          });
        }
        captions = dataResult.value;
      } else {
        const dataResult =
          await this.elasticCaptionsSyncRepository.getDataToSync(
            lastSync.latestSyncedCaptionId,
          );
        if (!dataResult.ok) {
          await this.elasticCaptionsSyncRepository.update(syncId, {
            syncStatus: "FAIL",
            syncCompletedAt: new Date(),
            failReason: "ERROR_GETTING_DATA_TO_SYNC",
          });
          return Failure({
            type: "ERROR_GETTING_DATA_TO_SYNC",
            error: dataResult.error,
          });
        }
        captions = dataResult.value;
      }

      if (captions.length === 0) {
        this.logger.info("No new captions to sync");
        await this.elasticCaptionsSyncRepository.update(syncId, {
          syncStatus: "SUCCESS",
          syncCompletedAt: new Date(),
          latestSyncedCaptionId: lastSync?.latestSyncedCaptionId ?? null,
        });
        return Success({ synced: 0 });
      }

      this.logger.info(`Syncing ${captions.length} captions to Elasticsearch`);
      for (let i = 0; i < captions.length; i += BULK_BATCH_SIZE) {
        await this.searchIndexes.write(
          SEARCH_INDEX,
          captions
            .slice(i, i + BULK_BATCH_SIZE)
            .map((caption) =>
              toSearchIndexDocument(caption, caption.channelId),
            ),
        );
      }

      const latestCaptionId = captions[captions.length - 1].id;
      await this.elasticCaptionsSyncRepository.update(syncId, {
        syncStatus: "SUCCESS",
        syncCompletedAt: new Date(),
        latestSyncedCaptionId: latestCaptionId,
      });

      this.logger.info(`Sync complete, latest caption ID: ${latestCaptionId}`);
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
