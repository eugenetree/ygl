type ElasticCaptionsSyncStatus = "NOT_STARTED" | "IN_PROGRESS" | "SUCCESS" | "FAIL";

export type ElasticCaptionsSync = {
  id: string;
  syncStatus: ElasticCaptionsSyncStatus;
  syncStartedAt: Date | null;
  syncCompletedAt: Date | null;
  latestSyncedCaptionId: string | null;
  failReason: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type ElasticCaptionsSyncProps = Omit<
  ElasticCaptionsSync,
  "id" | "createdAt" | "updatedAt" | "syncCompletedAt" | "latestSyncedCaptionId" | "failReason"
>;
