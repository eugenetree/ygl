import { injectable } from "inversify";
import type { RebuildSearchIndexOutput } from "../_common/messaging/definitions.js";
import type { RunCompleted } from "../_common/messaging/runs.js";
import { formatRebuildSearchIndexRunCompleted } from "./task-run-messages.js";
import { TelegramNotifier } from "./telegram-notifier.js";

@injectable()
export class OnRebuildSearchIndexRunCompletedUseCase {
  constructor(private readonly telegramNotifier: TelegramNotifier) {}

  async execute(run: RunCompleted<RebuildSearchIndexOutput>) {
    return this.telegramNotifier.sendMessage(
      formatRebuildSearchIndexRunCompleted(run),
    );
  }
}
