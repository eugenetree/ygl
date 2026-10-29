import { injectable } from "inversify";
import type { DatabaseError } from "../../../db/types.js";
import { Failure, type Result, Success } from "../../../types/index.js";
import { TASKS } from "../../_common/messaging/definitions.js";
import {
  type LatestRun,
  TaskQueue,
} from "../../_common/messaging/task-queue.js";

export type RecalculatePrioritiesStatus = {
  latestRun: LatestRun | undefined;
};

@injectable()
export class GetRecalculatePrioritiesStatusUseCase {
  constructor(private readonly taskQueue: TaskQueue) {}

  async execute(): Promise<Result<RecalculatePrioritiesStatus, DatabaseError>> {
    const result = await this.taskQueue.latestRuns([
      TASKS.RECALCULATE_PRIORITIES,
    ]);

    if (!result.ok) {
      return Failure(result.error);
    }

    return Success({ latestRun: result.value.at(0) });
  }
}
