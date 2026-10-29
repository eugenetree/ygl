import { injectable } from "inversify";
import { TASKS } from "../../../../../_common/messaging/definitions.js";
import { TaskQueue } from "../../../../../_common/messaging/task-queue.js";

@injectable()
export class RequestReprocessCaptionsUseCase {
  constructor(private readonly taskQueue: TaskQueue) {}

  async execute() {
    return this.taskQueue.request(TASKS.REPROCESS_CAPTIONS);
  }
}
