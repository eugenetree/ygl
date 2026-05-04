import { injectable } from "inversify";
import { Failure, Result, Success } from "../../../../types/index.js";
import { BaseError } from "../../../_common/errors.js";
import { Logger } from "../../../_common/logger/logger.js";
import { tryCatch } from "../../../_common/try-catch.js";
import { WorkerStopCause } from "../../constants.js";
import { ProcessVideoEntryUseCase } from "./use-cases/process-video-entry/process-video-entry.use-case.js";
import { VideoEntriesQueue } from "./video-entries.queue.js";
import { DatabaseClient } from "../../../../db/client.js";
import { DatabaseError, VideoJobSkipCause } from "../../../../db/types.js";

function toSkipCause(errorType: string): VideoJobSkipCause | null {
  if (errorType === "MEMBERS_ONLY_VIDEO") return "MEMBERS_ONLY";
  if (errorType === "GEO_RESTRICTED_VIDEO") return "GEO_RESTRICTED";
  if (errorType === "AGE_RESTRICTED_VIDEO") return "AGE_RESTRICTED";
  if (errorType === "PREMIERE_VIDEO") return "PREMIERE";
  return null;
}

type WorkerOptions = {
  shouldContinue: () => boolean;
  onError: (error: BaseError) => Promise<void>;
};

@injectable()
export class VideoEntriesWorker {
  private isRunning: boolean = false;

  constructor(
    logger: Logger,
    private readonly processVideoEntry: ProcessVideoEntryUseCase,
    private readonly videoEntriesQueue: VideoEntriesQueue,
    private readonly db: DatabaseClient,
  ) {
    this.logger = logger.child({ context: "VideoEntriesWorker", category: "worker-video-fetcher" });
  }

  private readonly logger: Logger;

  public async run({
    shouldContinue,
    onError,
  }: WorkerOptions): Promise<Result<WorkerStopCause, BaseError>> {
    if (this.isRunning) {
      return Failure({ type: "WORKER_ALREADY_RUNNING" });
    }

    this.isRunning = true;

    while (this.isRunning) {
      if (!shouldContinue()) {
        this.logger.info("shouldContinue() returned false. Stopping worker.");
        this.isRunning = false;
        return Success(WorkerStopCause.STOPPED);
      }

      const entryResult = await this.videoEntriesQueue.getNextEntry();

      if (!entryResult.ok) {
        this.logger.error({ error: entryResult.error });
        this.isRunning = false;
        await onError(entryResult.error);
        return entryResult;
      }

      const entry = entryResult.value;

      if (!entry) {
        this.logger.info("Video entries queue is empty.");
        this.isRunning = false;
        return Success(WorkerStopCause.EMPTY);
      }

      const result = await this.processVideoEntry.execute({
        videoId: entry.id,
        channelId: entry.channelId,
      });

      if (!result.ok) {
        const skipCause = toSkipCause(result.error.type);
        if (skipCause) {
          this.logger.info(`Video entry ${entry.id} skipped (${skipCause}).`);
          await this.videoEntriesQueue.markAsSkipped(entry.id, skipCause);
          continue;
        }

        this.logger.error({
          message: `Failed to process video entry ${entry.id}`,
          error: result.error,
          context: { entryId: entry.id },
        });

        await this.videoEntriesQueue.markAsFailed(entry.id);
        this.isRunning = false;
        await onError(result.error);
        return result;
      }

      const updateResult = await this.updateLastVideoProcessedAt(entry.channelId);

      if (!updateResult.ok) {
        this.logger.error({ message: "Failed to update lastVideoProcessedAt", error: updateResult.error });
        this.isRunning = false;
        await onError(updateResult.error);
        return updateResult;
      }

      await this.videoEntriesQueue.markAsSuccess(entry.id);
    }

    return Success(WorkerStopCause.DONE);
  }

  private async updateLastVideoProcessedAt(channelId: string): Promise<Result<void, DatabaseError>> {
    const result = await tryCatch(
      this.db
        .insertInto("channelPriorityScores")
        .values({
          channelId,
          score: 0,
          components: {} as unknown as Record<string, number>,
          lastVideoProcessedAt: new Date(),
        })
        .onConflict((oc) => oc.column("channelId").doUpdateSet({ lastVideoProcessedAt: new Date() }))
        .execute(),
    );

    if (!result.ok) {
      return Failure({ type: "DATABASE", error: result.error });
    }

    return Success(undefined);
  }
}
