import { injectable } from "inversify";

import { dbClient } from "../../../db/client.js";
import { ProcessingStatus } from "../../../db/types.js";
import { Failure, Result, Success } from "../../../types/index.js";
import { tryCatch } from "../../_common/try-catch.js";
import { Logger } from "../../_common/logger/logger.js";

type StatusCounts = Record<ProcessingStatus, number>;

export type JobStats = {
  channelDiscovery: StatusCounts;
  channel: StatusCounts;
  videoDiscovery: StatusCounts;
  video: StatusCounts;
  transcription: StatusCounts;
  videosWithValidManualCaptions: number;
};

const emptyStatusCounts = (): StatusCounts => ({
  PENDING: 0,
  PROCESSING: 0,
  SUCCEEDED: 0,
  FAILED: 0,
});

@injectable()
export class StatsRepository {
  constructor(private readonly logger: Logger) {
    this.logger.setContext(StatsRepository.name);
  }

  public async getStats(): Promise<Result<JobStats, Error>> {
    const jobTables = [
      "channelDiscoveryJobs",
      "channelJobs",
      "videoDiscoveryJobs",
      "videoJobs",
      "transcriptionJobs",
    ] as const;

    const queryJobTable = async (table: (typeof jobTables)[number]) => {
      return tryCatch(
        dbClient
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

    const results = await Promise.all(jobTables.map(queryJobTable));

    const statusCountsList: StatusCounts[] = [];
    for (const result of results) {
      if (!result.ok) {
        this.logger.error({ message: "Failed to query job stats", error: result.error });
        return Failure(result.error);
      }
      statusCountsList.push(toStatusCounts(result.value));
    }

    const validManualCaptionsResult = await tryCatch(
      dbClient
        .selectFrom("videos")
        .select((eb) => eb.fn.countAll<number>().as("count"))
        .where("manualCaptionsStatus", "=", "CAPTIONS_VALID")
        .executeTakeFirstOrThrow(),
    );

    if (!validManualCaptionsResult.ok) {
      this.logger.error({ message: "Failed to query valid manual captions count", error: validManualCaptionsResult.error });
      return Failure(validManualCaptionsResult.error);
    }

    return Success({
      channelDiscovery: statusCountsList[0],
      channel: statusCountsList[1],
      videoDiscovery: statusCountsList[2],
      video: statusCountsList[3],
      transcription: statusCountsList[4],
      videosWithValidManualCaptions: Number(validManualCaptionsResult.value.count),
    });
  }
}
