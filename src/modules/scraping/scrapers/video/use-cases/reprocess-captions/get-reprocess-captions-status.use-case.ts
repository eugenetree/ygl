import { injectable } from "inversify";
import type { DatabaseError } from "../../../../../../db/types.js";
import {
  Failure,
  type Result,
  Success,
} from "../../../../../../types/index.js";
import { TASKS } from "../../../../../_common/messaging/definitions.js";
import {
  type LatestRun,
  TaskQueue,
} from "../../../../../_common/messaging/task-queue.js";
import { VideoRepository } from "../../video.repository.js";

export type ReprocessCaptionsStatus = {
  latestRun: LatestRun | undefined;
  /** Counted only while a run is running. */
  videosLeft?: Result<number, DatabaseError>;
};

@injectable()
export class GetReprocessCaptionsStatusUseCase {
  constructor(
    private readonly taskQueue: TaskQueue,
    private readonly videoRepository: VideoRepository,
  ) {}

  async execute(): Promise<Result<ReprocessCaptionsStatus, DatabaseError>> {
    const result = await this.taskQueue.latestRuns([TASKS.REPROCESS_CAPTIONS]);
    if (!result.ok) {
      return Failure(result.error);
    }

    const latestRun = result.value.at(0);
    if (latestRun?.state !== "running") {
      return Success({ latestRun });
    }

    const videosLeft = await this.videoRepository.countVideosForReprocessing();
    return Success({ latestRun, videosLeft });
  }
}
