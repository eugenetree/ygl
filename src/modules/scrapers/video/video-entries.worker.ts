import { injectable } from "inversify";
import { Logger } from "../../_common/logger/logger.js";
import { VideoEntriesQueue } from "./video-entries.queue.js";
import { VideoEntriesProcessor } from "./video-entries.processor.js";

@injectable()
export class VideoEntriesWorker {
  private isRunning: boolean = false;

  constructor(
    private readonly logger: Logger,
    private readonly videoEntriesQueue: VideoEntriesQueue,
    private readonly videoEntriesProcessor: VideoEntriesProcessor
  ) { }

  public async start(shouldContinue: () => boolean = () => true) {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;

    while (this.isRunning) {
      if (!shouldContinue()) {
        this.logger.info("shouldContinue() returned false. Stopping worker.");
        this.isRunning = false;
        return;
      }

      const entryResult = await this.videoEntriesQueue.getNextEntry();

      if (!entryResult.ok) {
        this.logger.error({
          error: entryResult.error,
        });

        this.isRunning = false;
        return;
      }

      const entry = entryResult.value;

      if (!entry) {
        this.logger.info("Video entries queue is empty. Waiting...");
        await new Promise((resolve) => setTimeout(resolve, 1000 * 60));
        continue;
      }

      this.logger.info("Waiting 5 seconds");
      await new Promise((resolve) => setTimeout(resolve, 1000 * 5));
      this.logger.info(`Processing video entry ${entry.id}...`);
      const processResult = await this.videoEntriesProcessor.process(entry);

      if (!processResult.ok) {
        this.logger.error({
          message: `Failed to process video entry ${entry.id}`,
          error: processResult.error,
          context: { entryId: entry.id },
        });

        await this.videoEntriesQueue.markAsFailed(entry.id);
        continue;
      }

      this.logger.info(`Processing video entry ${entry.id} finished`);

      const markAsSuccessResult = await this.videoEntriesQueue.markAsSuccess(
        entry.id
      );

      if (!markAsSuccessResult.ok) {
        this.logger.error({
          message: `Failed to mark video entry ${entry.id} as success`,
          error: markAsSuccessResult.error,
          context: { entryId: entry.id },
        });

        await this.videoEntriesQueue.markAsFailed(entry.id);
        this.isRunning = false;
        return;
      }
    }
  }
}
