import { injectable } from "inversify";
import type { DatabaseError } from "../../db/types.js";
import { Failure, type Result, Success } from "../../types/index.js";
import { TASKS } from "../_common/messaging/definitions.js";
import { type LatestRun, TaskQueue } from "../_common/messaging/task-queue.js";
import type { SearchUnavailableError } from "./captions.service.js";
import { type RebuildProgress, SearchIndexes } from "./search-indexes.js";

export type RebuildSearchIndexStatus = {
  latestRun: LatestRun | undefined;
  /** Read only while a run is running; null before it has created its index. */
  progress?: Result<RebuildProgress | null, SearchUnavailableError>;
};

@injectable()
export class GetRebuildSearchIndexStatusUseCase {
  constructor(
    private readonly taskQueue: TaskQueue,
    private readonly searchIndexes: SearchIndexes,
  ) {}

  async execute(): Promise<Result<RebuildSearchIndexStatus, DatabaseError>> {
    const result = await this.taskQueue.latestRuns([
      TASKS.REBUILD_SEARCH_INDEX,
    ]);

    if (!result.ok) {
      return Failure(result.error);
    }

    const latestRun = result.value.at(0);

    if (latestRun?.state !== "running") {
      return Success({ latestRun });
    }

    const progress = await this.searchIndexes.rebuildProgress();
    return Success({ latestRun, progress });
  }
}
