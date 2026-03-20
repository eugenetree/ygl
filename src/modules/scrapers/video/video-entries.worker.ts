import { injectable } from "inversify";
import { Result, Success, Failure } from "../../../types/index.js";
import { BaseError } from "../../_common/errors.js";
import { Logger } from "../../_common/logger/logger.js";
import { WORKER_STOP_CAUSE, WorkerStopCause } from "../constants.js";
import { ProcessVideoEntryUseCase } from "./use-cases/process-video-entry/process-video-entry.use-case.js";
import { VideoEntriesQueue } from "./video-entries.queue.js";

type WorkerOptions = {
  shouldContinue: () => boolean;
  onError: (error: BaseError) => Promise<{ shouldContinue: boolean }>;
};

@injectable()
export class VideoEntriesWorker {
  private isRunning: boolean = false;

  constructor(
    logger: Logger,
    private readonly processVideoEntry: ProcessVideoEntryUseCase,
    private readonly videoEntriesQueue: VideoEntriesQueue,
  ) {
    this.logger = logger.child({ context: "VideoEntriesWorker", category: "worker-video-fetcher" });
  }

  private readonly logger: Logger;

  public async run({
    shouldContinue,
    onError,
  }: WorkerOptions): Promise<Result<WorkerStopCause, BaseError>> {
    if (this.isRunning) {
      return Success(WORKER_STOP_CAUSE.DONE);
    }

    this.isRunning = true;

    while (this.isRunning) {
      if (!shouldContinue()) {
        this.logger.info("shouldContinue() returned false. Stopping worker.");
        this.isRunning = false;
        return Success(WORKER_STOP_CAUSE.DONE);
      }

      const entryResult = await this.videoEntriesQueue.getNextEntry();

      if (!entryResult.ok) {
        this.logger.error({ error: entryResult.error });
        this.isRunning = false;
        await onError(entryResult.error);
        return Failure(entryResult.error);
      }

      const entry = entryResult.value;

      if (!entry) {
        this.logger.info("Video entries queue is empty.");
        this.isRunning = false;
        return Success(WORKER_STOP_CAUSE.EMPTY);
      }

      const result = await this.processVideoEntry.execute({
        id: entry.id,
        channelId: entry.channelId,
      });

      if (!result.ok) {
        this.logger.error({
          message: `Failed to process video entry ${entry.id}`,
          error: result.error,
          context: { entryId: entry.id },
        });
        await this.videoEntriesQueue.markAsFailed(entry.id);

        const { shouldContinue: canContinue } = await onError(result.error);
        if (!canContinue) {
          this.isRunning = false;
          return Failure(result.error);
        }

        continue;
      }

      await this.videoEntriesQueue.markAsSuccess(entry.id);

      await new Promise((resolve) => setTimeout(resolve, 1000 * 5));
    }

    return Success(WORKER_STOP_CAUSE.DONE);
  }
}
