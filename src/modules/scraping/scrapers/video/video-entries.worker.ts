import { inject, injectable, optional } from "inversify";
import { VideoJobSkipCause } from "../../../../db/types.js";
import { Failure, type Result, Success } from "../../../../types/index.js";
import { BaseError } from "../../../_common/errors.js";
import { Logger } from "../../../_common/logger/logger.js";
import { WorkerStopCause } from "../../constants.js";
import { ProcessVideoEntryUseCase } from "./use-cases/process-video-entry/process-video-entry.use-case.js";
import { VideoEntriesQueue } from "./video-entries.queue.js";

function toSkipCause(errorType: string): VideoJobSkipCause | null {
  if (errorType === "MEMBERS_ONLY_VIDEO") return "MEMBERS_ONLY";
  if (errorType === "GEO_RESTRICTED_VIDEO") return "GEO_RESTRICTED";
  if (errorType === "AGE_RESTRICTED_VIDEO") return "AGE_RESTRICTED";
  if (errorType === "PREMIERE_VIDEO") return "PREMIERE";
  if (errorType === "REMOVED_BY_UPLOADER_VIDEO") return "REMOVED_BY_UPLOADER";
  if (errorType === "CLAIMED_CONTENT_VIDEO") return "CLAIMED_CONTENT";
  return null;
}

/**
 * Pause between videos so the scraper stays under YouTube's request rate limit
 * (the yt-dlp wiki advises 5-10 s between downloads; each video costs several
 * yt-dlp invocations). Randomized so the cadence does not look scripted.
 */
const PAUSE_BETWEEN_ENTRIES_MS = { min: 5_000, max: 10_000 };

export type PauseBetweenEntries = () => Promise<void>;
export const PAUSE_BETWEEN_ENTRIES = Symbol.for("PAUSE_BETWEEN_ENTRIES");

const randomizedPause: PauseBetweenEntries = () => {
  const { min, max } = PAUSE_BETWEEN_ENTRIES_MS;
  const ms = min + Math.random() * (max - min);
  return new Promise((resolve) => setTimeout(resolve, ms));
};

type WorkerOptions = {
  shouldContinue: () => boolean;
  onError: (error: BaseError) => Promise<void>;
};

@injectable()
export class VideoEntriesWorker {
  private isRunning: boolean = false;

  // Explicit token for the function-typed pause, as with YT_DLP_RUNNER.
  constructor(
    logger: Logger,
    private readonly processVideoEntry: ProcessVideoEntryUseCase,
    private readonly videoEntriesQueue: VideoEntriesQueue,
    @optional()
    @inject(PAUSE_BETWEEN_ENTRIES)
    pauseBetweenEntries?: PauseBetweenEntries,
  ) {
    this.logger = logger.child({
      context: "VideoEntriesWorker",
      category: "worker-video-fetcher",
    });
    this.pauseBetweenEntries = pauseBetweenEntries ?? randomizedPause;
  }

  private readonly logger: Logger;
  private readonly pauseBetweenEntries: PauseBetweenEntries;

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

      if (result.ok) {
        await this.videoEntriesQueue.markAsSuccess(entry.id);
      } else {
        const skipCause = toSkipCause(result.error.type);
        if (!skipCause) {
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

        this.logger.info(`Video entry ${entry.id} skipped (${skipCause}).`);
        await this.videoEntriesQueue.markAsSkipped(entry.id, skipCause);
      }

      // YouTube was just hit for this entry; do not go straight for the next
      // one — unless a stop is pending, when the wait would only delay it.
      if (shouldContinue()) await this.pauseBetweenEntries();
    }

    return Success(WorkerStopCause.DONE);
  }
}
