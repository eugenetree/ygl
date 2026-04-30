import { injectable } from "inversify";

import { dbClient } from "../../../db/client.js";
import { JobStatus, TranscriptionJobStatus } from "../../../db/types.js";
import { Failure, Result, Success } from "../../../types/index.js";
import { tryCatch } from "../../_common/try-catch.js";
import { Logger } from "../../_common/logger/logger.js";

type StatusCounts = Record<JobStatus, number>;
type VideoStatusCounts = Record<JobStatus | "SKIPPED", number>;
type TranscriptionStatusCounts = Record<TranscriptionJobStatus, number>;

export type JobStats = {
  channelDiscovery: StatusCounts;
  channel: StatusCounts;
  videoDiscovery: StatusCounts;
  video: VideoStatusCounts;
  transcription: TranscriptionStatusCounts;
  videosWithValidManualCaptions: number;
};

const emptyStatusCounts = (): StatusCounts => ({
  PENDING: 0,
  RUNNING: 0,
  SUCCEEDED: 0,
  FAILED: 0,
});

const emptyVideoStatusCounts = (): VideoStatusCounts => ({
  PENDING: 0,
  RUNNING: 0,
  SUCCEEDED: 0,
  FAILED: 0,
  SKIPPED: 0,
});

const emptyTranscriptionStatusCounts = (): TranscriptionStatusCounts => ({
  PENDING: 0,
  RUNNING: 0,
  SUCCEEDED: 0,
  FAILED: 0,
  NOT_NEEDED: 0,
});

@injectable()
export class StatsRepository {
  constructor(private readonly logger: Logger) {
    this.logger.setContext(StatsRepository.name);
  }

  public async getStats(): Promise<Result<JobStats, Error>> {
    const [
      channelDiscoveryResult,
      channelResult,
      videoDiscoveryResult,
      videoResult,
      transcriptionResult,
      validManualCaptionsResult,
    ] = await Promise.all([
      tryCatch(
        dbClient
          .selectFrom("searchChannelQueries")
          .select("channelDiscoveryStatus as status")
          .select((eb) => eb.fn.countAll<number>().as("count"))
          .groupBy("channelDiscoveryStatus")
          .execute(),
      ),
      tryCatch(
        dbClient
          .selectFrom("channelEntries")
          .select("channelProcessStatus as status")
          .select((eb) => eb.fn.countAll<number>().as("count"))
          .groupBy("channelProcessStatus")
          .execute(),
      ),
      tryCatch(
        dbClient
          .selectFrom("channels")
          .select("videoDiscoveryStatus as status")
          .select((eb) => eb.fn.countAll<number>().as("count"))
          .groupBy("videoDiscoveryStatus")
          .execute(),
      ),
      tryCatch(
        dbClient
          .selectFrom("videoEntries")
          .select("videoProcessStatus as status")
          .select((eb) => eb.fn.countAll<number>().as("count"))
          .where("videoProcessStatus", "is not", null)
          .groupBy("videoProcessStatus")
          .execute(),
      ),
      tryCatch(
        dbClient
          .selectFrom("videos")
          .select("transcriptionStatus as status")
          .select((eb) => eb.fn.countAll<number>().as("count"))
          .groupBy("transcriptionStatus")
          .execute(),
      ),
      tryCatch(
        dbClient
          .selectFrom("videos")
          .select((eb) => eb.fn.countAll<number>().as("count"))
          .where("manualCaptionsStatus", "=", "CAPTIONS_VALID")
          .executeTakeFirstOrThrow(),
      ),
    ]);

    if (!channelDiscoveryResult.ok) {
      this.logger.error({ message: "Failed to query channelDiscovery stats", error: channelDiscoveryResult.error });
      return Failure(channelDiscoveryResult.error);
    }
    if (!channelResult.ok) {
      this.logger.error({ message: "Failed to query channel stats", error: channelResult.error });
      return Failure(channelResult.error);
    }
    if (!videoDiscoveryResult.ok) {
      this.logger.error({ message: "Failed to query videoDiscovery stats", error: videoDiscoveryResult.error });
      return Failure(videoDiscoveryResult.error);
    }
    if (!videoResult.ok) {
      this.logger.error({ message: "Failed to query video stats", error: videoResult.error });
      return Failure(videoResult.error);
    }
    if (!transcriptionResult.ok) {
      this.logger.error({ message: "Failed to query transcription stats", error: transcriptionResult.error });
      return Failure(transcriptionResult.error);
    }
    if (!validManualCaptionsResult.ok) {
      this.logger.error({ message: "Failed to query valid manual captions count", error: validManualCaptionsResult.error });
      return Failure(validManualCaptionsResult.error);
    }

    const toStatusCounts = (rows: { status: string; count: number }[]): StatusCounts => {
      const counts = emptyStatusCounts();
      for (const row of rows) {
        if (row.status in counts) {
          counts[row.status as JobStatus] = Number(row.count);
        }
      }
      return counts;
    };

    const toVideoStatusCounts = (rows: { status: string | null; count: number }[]): VideoStatusCounts => {
      const counts = emptyVideoStatusCounts();
      for (const row of rows) {
        if (row.status && row.status in counts) {
          counts[row.status as keyof VideoStatusCounts] = Number(row.count);
        }
      }
      return counts;
    };

    const toTranscriptionStatusCounts = (rows: { status: string; count: number }[]): TranscriptionStatusCounts => {
      const counts = emptyTranscriptionStatusCounts();
      for (const row of rows) {
        if (row.status in counts) {
          counts[row.status as TranscriptionJobStatus] = Number(row.count);
        }
      }
      return counts;
    };

    return Success({
      channelDiscovery: toStatusCounts(channelDiscoveryResult.value),
      channel: toStatusCounts(channelResult.value),
      videoDiscovery: toStatusCounts(videoDiscoveryResult.value),
      video: toVideoStatusCounts(videoResult.value),
      transcription: toTranscriptionStatusCounts(transcriptionResult.value),
      videosWithValidManualCaptions: Number(validManualCaptionsResult.value.count),
    });
  }
}
