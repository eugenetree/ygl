import { injectable } from "inversify";
import type { RunFailed } from "../_common/messaging/runs.js";
import { formatTaskRunFailed } from "./task-run-messages.js";
import { TelegramNotifier } from "./telegram-notifier.js";

@injectable()
export class OnTaskRunFailedUseCase {
  constructor(private readonly telegramNotifier: TelegramNotifier) {}

  async execute(run: RunFailed) {
    return this.telegramNotifier.sendMessage(formatTaskRunFailed(run));
  }
}
