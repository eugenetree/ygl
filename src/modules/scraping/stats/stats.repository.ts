import { injectable } from "inversify";

import { DatabaseClient } from "../../../db/client.js";
import { ProcessingStatus, VideoJobStatus } from "../../../db/types.js";
import { Failure, Result, Success } from "../../../types/index.js";
import { tryCatch } from "../../_common/try-catch.js";
import { Logger } from "../../_common/logger/logger.js";

type StatusCounts = Record<ProcessingStatus, number>;
type VideoStatusCounts = Record<VideoJobStatus, number>;

export type JobStats = {
  channelDiscovery: StatusCounts;
  channel: StatusCounts;
  videoDiscovery: StatusCounts;
  video: VideoStatusCounts;
  transcription: StatusCounts;
  videosWithValidManualCaptions: number;
};

const emptyStatusCounts = (): StatusCounts => ({
  PENDING: 0,
  PROCESSING: 0,
  SUCCEEDED: 0,
  FAILED: 0,
});

const emptyVideoStatusCounts = (): VideoStatusCounts => ({
  PENDING: 0,
  PROCESSING: 0,
  SUCCEEDED: 0,
  FAILED: 0,
  SKIPPED: 0,
});

@injectable()
export class StatsRepository {
  constructor(
    private readonly logger: Logger,
    private readonly db: DatabaseClient,
  ) {
    this.logger.setContext(StatsRepository.name);
  }

  public async getStats(): Promise<Result<JobStats, Error>> {
    const nonVideoJobTables = [
      "channelDiscoveryJobs",
      "channelJobs",
      "videoDiscoveryJobs",
      "transcriptionJobs",
    ] as const;

    const queryJobTable = async (table: (typeof nonVideoJobTables)[number]) => {
      return tryCatch(
        this.db
          .selectFrom(table)
          .select(["status"])
          .select((eb) => eb.fn.countAll<number>().as("count"))
          .groupBy("status")
          .execute(),
      );
    };

    const toStatusCounts = (rows: { status: ProcessingStatus; count: number }[]): StatusCounts => {
      const counts = emptyStatusCounts();
      for (const row of rows) {
        counts[row.status] = Number(row.count);
      }
      return counts;
    };

    const toVideoStatusCounts = (rows: { status: VideoJobStatus; count: number }[]): VideoStatusCounts => {
      const counts = emptyVideoStatusCounts();
      for (const row of rows) {
        counts[row.status] = Number(row.count);
      }
      return counts;
    };

    const [nonVideoResults, videoJobsResult, validManualCaptionsResult] = await Promise.all([
      Promise.all(nonVideoJobTables.map(queryJobTable)),
      tryCatch(
        this.db
          .selectFrom("videoJobs")
          .select(["status"])
          .select((eb) => eb.fn.countAll<number>().as("count"))
          .groupBy("status")
          .execute(),
      ),
      tryCatch(
        this.db
          .selectFrom("videos")
          .select((eb) => eb.fn.countAll<number>().as("count"))
          .where("manualCaptionsStatus", "=", "CAPTIONS_VALID")
          .executeTakeFirstOrThrow(),
      ),
    ]);

    const statusCountsList: StatusCounts[] = [];
    for (const result of nonVideoResults) {
      if (!result.ok) {
        this.logger.error({ message: "Failed to query job stats", error: result.error });
        return Failure(result.error);
      }
      statusCountsList.push(toStatusCounts(result.value));
    }

    if (!videoJobsResult.ok) {
      this.logger.error({ message: "Failed to query video job stats", error: videoJobsResult.error });
      return Failure(videoJobsResult.error);
    }

    if (!validManualCaptionsResult.ok) {
      this.logger.error({ message: "Failed to query valid manual captions count", error: validManualCaptionsResult.error });
      return Failure(validManualCaptionsResult.error);
    }

    return Success({
      channelDiscovery: statusCountsList[0],
      channel: statusCountsList[1],
      videoDiscovery: statusCountsList[2],
      video: toVideoStatusCounts(videoJobsResult.value),
      transcription: statusCountsList[3],
      videosWithValidManualCaptions: Number(validManualCaptionsResult.value.count),
    });
  }
}
