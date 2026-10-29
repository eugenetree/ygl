import { injectable } from "inversify";
import { TASKS } from "../_common/messaging/definitions.js";
import { TaskQueue } from "../_common/messaging/task-queue.js";

@injectable()
export class RequestRebuildSearchIndexUseCase {
  constructor(private readonly taskQueue: TaskQueue) {}

  async execute() {
    return this.taskQueue.request(TASKS.REBUILD_SEARCH_INDEX);
  }
}
