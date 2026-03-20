import { injectable } from "inversify";
import { Result, Success, Failure } from "../../../types/index.js";
import { BaseError } from "../../_common/errors.js";
import { Logger } from "../../_common/logger/logger.js";
import { WORKER_STOP_CAUSE, WorkerStopCause } from "../constants.js";
import { ProcessChannelEntryUseCase } from "./use-cases/process-channel-entry.use-case.js";
import { ChannelEntriesQueue } from "./channel-entries.queue.js";

type WorkerOptions = {
  shouldContinue: () => boolean;
  onError: (error: BaseError) => Promise<{ shouldContinue: boolean }>;
};

@injectable()
export class ChannelEntriesWorker {
  private isRunning: boolean = false;

  constructor(
    logger: Logger,
    private readonly processChannelEntry: ProcessChannelEntryUseCase,
    private readonly channelEntriesQueue: ChannelEntriesQueue,
  ) {
    this.logger = logger.child({ context: "ChannelEntriesWorker", category: "worker-channel-fetcher" });
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

      const entryResult = await this.channelEntriesQueue.getNextEntry();

      if (!entryResult.ok) {
        this.logger.error({ error: entryResult.error });
        this.isRunning = false;
        await onError(entryResult.error);
        return Failure(entryResult.error);
      }

      const entry = entryResult.value;

      if (!entry) {
        this.logger.info("Channel entries queue is empty.");
        this.isRunning = false;
        return Success(WORKER_STOP_CAUSE.EMPTY);
      }

      const result = await this.processChannelEntry.execute(entry.id);

      if (!result.ok) {
        this.logger.error({
          message: `Failed to process channel entry ${entry.id}`,
          error: result.error,
          context: { entryId: entry.id },
        });

        await this.channelEntriesQueue.markAsFailed(entry.id);

        const { shouldContinue: canContinue } = await onError(result.error);
        if (!canContinue) {
          this.isRunning = false;
          return Failure(result.error);
        }

        continue;
      }

      await this.channelEntriesQueue.markAsSuccess(entry.id);

      await new Promise((resolve) => setTimeout(resolve, 5000));
    }

    return Success(WORKER_STOP_CAUSE.DONE);
  }
}
