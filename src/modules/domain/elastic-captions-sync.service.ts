import { ElasticCaptionsSync } from "./elastic-captions-sync.js";

export class ElasticCaptionsSyncService {
  create(): ElasticCaptionsSync {
    return {
      id: crypto.randomUUID(),
      createdAt: new Date(),
      updatedAt: new Date(),
      syncStatus: "NOT_STARTED",
      syncStartedAt: null,
      syncCompletedAt: null,
      latestSyncedCaptionId: null,
      failReason: null,
    };
  }
}