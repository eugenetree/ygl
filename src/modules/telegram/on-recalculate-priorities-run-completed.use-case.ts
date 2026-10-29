import { injectable } from "inversify";
import type { RecalculatePrioritiesOutput } from "../_common/messaging/definitions.js";
import type { RunCompleted } from "../_common/messaging/runs.js";
import { formatRecalculatePrioritiesRunCompleted } from "./task-run-messages.js";
import { TelegramNotifier } from "./telegram-notifier.js";

@injectable()
export class OnRecalculatePrioritiesRunCompletedUseCase {
  constructor(private readonly telegramNotifier: TelegramNotifier) {}

  async execute(run: RunCompleted<RecalculatePrioritiesOutput>) {
    return this.telegramNotifier.sendMessage(
      formatRecalculatePrioritiesRunCompleted(run),
    );
  }
}
