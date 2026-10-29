import { injectable } from "inversify";
import { TASKS } from "../../_common/messaging/definitions.js";
import { TaskQueue } from "../../_common/messaging/task-queue.js";

@injectable()
export class RequestRecalculatePrioritiesUseCase {
  constructor(private readonly taskQueue: TaskQueue) {}

  async execute() {
    return this.taskQueue.request(TASKS.RECALCULATE_PRIORITIES);
  }
}
