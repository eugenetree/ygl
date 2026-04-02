import { injectable } from "inversify";
import { Failure, Result, Success } from "../../../../types/index.js";
import { BaseError } from "../../../_common/errors.js";
import { Logger } from "../../../_common/logger/logger.js";
import { WorkerStopCause } from "../../constants.js";
import { ProcessVideoEntryUseCase } from "./use-cases/process-video-entry/process-video-entry.use-case.js";
import { VideoEntriesQueue } from "./video-entries.queue.js";

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
        this.isRunning = false;
        await onError(result.error);
        return result;
      }

      await this.videoEntriesQueue.markAsSuccess(entry.id);

      await new Promise((resolve) => setTimeout(resolve, 1000 * 5));
    }

    return Success(WorkerStopCause.DONE);
  }
}
