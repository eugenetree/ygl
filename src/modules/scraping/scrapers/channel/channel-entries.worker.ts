import { injectable } from "inversify";
import { Failure, Result, Success } from "../../../../types/index.js";
import { BaseError } from "../../../_common/errors.js";
import { Logger } from "../../../_common/logger/logger.js";
import { WorkerStopCause } from "../../constants.js";
import { ProcessChannelEntryUseCase } from "./use-cases/process-channel-entry.use-case.js";
import { ChannelEntriesQueue } from "./channel-entries.queue.js";

type WorkerOptions = {
  shouldContinue: () => boolean;
  onError: (error: BaseError) => Promise<void>;
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
      return Failure({ type: "WORKER_ALREADY_RUNNING" });
    }

    this.isRunning = true;

    while (this.isRunning) {
      if (!shouldContinue()) {
        this.logger.info("shouldContinue() returned false. Stopping worker.");
        this.isRunning = false;
        return Success(WorkerStopCause.STOPPED);
      }

      const entryResult = await this.channelEntriesQueue.getNextEntry();

      if (!entryResult.ok) {
        this.logger.error({ error: entryResult.error });
        this.isRunning = false;
        await onError(entryResult.error);
        return entryResult;
      }

      const entry = entryResult.value;

      if (!entry) {
        this.logger.info("Channel entries queue is empty.");
        this.isRunning = false;
        return Success(WorkerStopCause.EMPTY);
      }

      const result = await this.processChannelEntry.execute(entry.id);

      if (!result.ok) {
        this.logger.error({
          message: `Failed to process channel entry ${entry.id}`,
          error: result.error,
          context: { entryId: entry.id },
        });
        await this.channelEntriesQueue.markAsFailed(entry.id);
        this.isRunning = false;
        await onError(result.error);
        return result;
      }

      await this.channelEntriesQueue.markAsSuccess(entry.id);

      await new Promise((resolve) => setTimeout(resolve, 5000));
    }

    return Success(WorkerStopCause.DONE);
  }
}
