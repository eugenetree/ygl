import { injectable } from "inversify";
import type { ReprocessCaptionsOutput } from "../_common/messaging/definitions.js";
import type { RunCompleted } from "../_common/messaging/runs.js";
import { formatReprocessCaptionsRunCompleted } from "./task-run-messages.js";
import { TelegramNotifier } from "./telegram-notifier.js";

@injectable()
export class OnReprocessCaptionsRunCompletedUseCase {
  constructor(private readonly telegramNotifier: TelegramNotifier) {}

  async execute(run: RunCompleted<ReprocessCaptionsOutput>) {
    return this.telegramNotifier.sendMessage(
      formatReprocessCaptionsRunCompleted(run),
    );
  }
}
