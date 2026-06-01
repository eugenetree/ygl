import { injectable } from "inversify";

import { DatabaseClient } from "../../../db/client.js";
import {
  Database,
  ProcessingStatus,
  VideoDiscoveryJobStatus,
  VideoJobStatus,
} from "../../../db/types.js";
import { Failure, type Result, Success } from "../../../types/index.js";
import { Logger } from "../../_common/logger/logger.js";
import { tryCatch } from "../../_common/try-catch.js";

type StatusCounts<TStatus extends string> = Record<TStatus, number>;

export type JobStats = {
  channelDiscovery: StatusCounts<ProcessingStatus>;
  channel: StatusCounts<ProcessingStatus>;
  videoDiscovery: StatusCounts<VideoDiscoveryJobStatus>;
  video: StatusCounts<VideoJobStatus>;
  transcription: StatusCounts<ProcessingStatus>;
  videosWithValidManualCaptions: number;
};

const PROCESSING_STATUSES = [
  "PENDING",
  "PROCESSING",
  "SUCCEEDED",
  "FAILED",
] as const satisfies readonly ProcessingStatus[];
const VIDEO_DISCOVERY_JOB_STATUSES = [
  ...PROCESSING_STATUSES,
  "SKIPPED",
] as const satisfies readonly VideoDiscoveryJobStatus[];
const VIDEO_JOB_STATUSES = [
  ...PROCESSING_STATUSES,
  "SKIPPED",
] as const satisfies readonly VideoJobStatus[];

const buildStatusCounts = <TStatus extends string>(
  allowedStatuses: readonly TStatus[],
  rows: { status: string; count: number }[],
): StatusCounts<TStatus> => {
  const counts = Object.fromEntries(
    allowedStatuses.map((status) => [status, 0]),
  ) as StatusCounts<TStatus>;
  for (const row of rows) {
    if ((allowedStatuses as readonly string[]).includes(row.status)) {
      counts[row.status as TStatus] = Number(row.count);
    }
  }
  return counts;
};

type JobTableName = Extract<
  keyof Database,
  | "channelDiscoveryJobs"
  | "channelJobs"
  | "videoDiscoveryJobs"
  | "videoJobs"
  | "transcriptionJobs"
>;

@injectable()
export class StatsRepository {
  constructor(
    private readonly logger: Logger,
    private readonly db: DatabaseClient,
  ) {
    this.logger.setContext(StatsRepository.name);
  }

  public async getStats(): Promise<Result<JobStats, Error>> {
    const queryStatusCountsForTable = (table: JobTableName) =>
      tryCatch(
        this.db
          .selectFrom(table)
          .select(["status"])
          .select((eb) => eb.fn.countAll<number>().as("count"))
          .groupBy("status")
          .execute(),
      );

    const [
      channelDiscoveryJobsResult,
      channelJobsResult,
      videoDiscoveryJobsResult,
      videoJobsResult,
      transcriptionJobsResult,
      validManualCaptionsResult,
    ] = await Promise.all([
      queryStatusCountsForTable("channelDiscoveryJobs"),
      queryStatusCountsForTable("channelJobs"),
      queryStatusCountsForTable("videoDiscoveryJobs"),
      queryStatusCountsForTable("videoJobs"),
      queryStatusCountsForTable("transcriptionJobs"),
      tryCatch(
        this.db
          .selectFrom("videos")
          .select((eb) => eb.fn.countAll<number>().as("count"))
          .where("manualCaptionsStatus", "=", "CAPTIONS_VALID")
          .executeTakeFirstOrThrow(),
      ),
    ]);

    const allResults = [
      channelDiscoveryJobsResult,
      channelJobsResult,
      videoDiscoveryJobsResult,
      videoJobsResult,
      transcriptionJobsResult,
      validManualCaptionsResult,
    ];
    for (const result of allResults) {
      if (!result.ok) {
        this.logger.error({
          message: "Failed to query job stats",
          error: result.error,
        });
        return Failure(result.error);
      }
    }

    if (
      !channelDiscoveryJobsResult.ok ||
      !channelJobsResult.ok ||
      !videoDiscoveryJobsResult.ok ||
      !videoJobsResult.ok ||
      !transcriptionJobsResult.ok ||
      !validManualCaptionsResult.ok
    ) {
      // Unreachable: handled above. Required so TS narrows each result to Success<T>.
      return Failure(new Error("unreachable"));
    }

    return Success({
      channelDiscovery: buildStatusCounts(
        PROCESSING_STATUSES,
        channelDiscoveryJobsResult.value,
      ),
      channel: buildStatusCounts(PROCESSING_STATUSES, channelJobsResult.value),
      videoDiscovery: buildStatusCounts(
        VIDEO_DISCOVERY_JOB_STATUSES,
        videoDiscoveryJobsResult.value,
      ),
      video: buildStatusCounts(VIDEO_JOB_STATUSES, videoJobsResult.value),
      transcription: buildStatusCounts(
        PROCESSING_STATUSES,
        transcriptionJobsResult.value,
      ),
      videosWithValidManualCaptions: Number(
        validManualCaptionsResult.value.count,
      ),
    });
  }
}
