import "reflect-metadata";

import { Container } from "inversify";

import { HttpClient, httpClient } from "./modules/_common/http/index.js";
import { Logger } from "./modules/_common/logger/logger.js";
import { EVENTS } from "./modules/_common/messaging/definitions.js";
import { EventBus } from "./modules/_common/messaging/event-bus.js";
import { MessagingConnection } from "./modules/_common/messaging/messaging-connection.js";
import { OnRebuildSearchIndexRunCompletedUseCase } from "./modules/telegram/on-rebuild-search-index-run-completed.use-case.js";
import { OnRecalculatePrioritiesRunCompletedUseCase } from "./modules/telegram/on-recalculate-priorities-run-completed.use-case.js";
import { OnReprocessCaptionsRunCompletedUseCase } from "./modules/telegram/on-reprocess-captions-run-completed.use-case.js";
import { OnTaskRunFailedUseCase } from "./modules/telegram/on-task-run-failed.use-case.js";
import { ScraperStatusWatcher } from "./modules/telegram/scraper-status-watcher.js";
import { TelegramBot } from "./modules/telegram/telegram-bot.js";
import { TelegramNotifier } from "./modules/telegram/telegram-notifier.js";

async function main() {
  const container = new Container({ autobind: true });
  container
    .bind(Logger)
    .toDynamicValue(
      () => new Logger({ context: "main-bot", category: "main" }),
    );
  container.bind(HttpClient).toConstantValue(httpClient);
  container.bind(TelegramBot).toSelf().inSingletonScope();
  container.bind(MessagingConnection).toSelf().inSingletonScope();

  const messagingConnection = container.get(MessagingConnection);
  const eventBus = container.get(EventBus);
  const onRecalculatePrioritiesRunCompletedUseCase = container.get(
    OnRecalculatePrioritiesRunCompletedUseCase,
  );
  const onReprocessCaptionsRunCompletedUseCase = container.get(
    OnReprocessCaptionsRunCompletedUseCase,
  );
  const onRebuildSearchIndexRunCompletedUseCase = container.get(
    OnRebuildSearchIndexRunCompletedUseCase,
  );
  const onTaskRunFailedUseCase = container.get(OnTaskRunFailedUseCase);
  const telegramBot = container.get(TelegramBot);
  const scraperStatusWatcher = container.get(ScraperStatusWatcher);
  const telegramNotifier = container.get(TelegramNotifier);

  const shutdown = async () => {
    await telegramBot.stop();
    await scraperStatusWatcher.stop();
    await messagingConnection.stop();
    process.exit(0);
  };

  process.on("SIGTERM", () => shutdown());
  process.on("SIGINT", () => shutdown());

  await messagingConnection.start();
  await eventBus.subscribe(
    EVENTS.RECALCULATE_PRIORITIES_RUN_COMPLETED,
    "telegram",
    (run) => onRecalculatePrioritiesRunCompletedUseCase.execute(run),
  );
  await eventBus.subscribe(
    EVENTS.REPROCESS_CAPTIONS_RUN_COMPLETED,
    "telegram",
    (run) => onReprocessCaptionsRunCompletedUseCase.execute(run),
  );
  await eventBus.subscribe(
    EVENTS.REBUILD_SEARCH_INDEX_RUN_COMPLETED,
    "telegram",
    (run) => onRebuildSearchIndexRunCompletedUseCase.execute(run),
  );
  await eventBus.subscribe(EVENTS.TASK_RUN_FAILED, "telegram", (run) =>
    onTaskRunFailedUseCase.execute(run),
  );
  await telegramBot.start();
  await scraperStatusWatcher.start();

  telegramNotifier.sendMessage("Bot started.");
}

main().catch((err) => {
  console.error("Critical error in main-bot:", err);
  process.exit(1);
});
