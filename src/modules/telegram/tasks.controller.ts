import { injectable } from "inversify";
import { Telegraf } from "telegraf";

import { Logger } from "../_common/logger/logger.js";
import { TASKS } from "../_common/messaging/definitions.js";
import { type AnyTask, TaskQueue } from "../_common/messaging/task-queue.js";
import { RequestRebuildSearchIndexUseCase } from "../captions-search/request-rebuild-search-index.use-case.js";
import { SearchIndexes } from "../captions-search/search-indexes.js";
import { RequestRecalculatePrioritiesUseCase } from "../scraping/channel-priority/request-recalculate-priorities.use-case.js";
import { RequestReprocessCaptionsUseCase } from "../scraping/scrapers/video/use-cases/reprocess-captions/request-reprocess-captions.use-case.js";
import { VideoRepository } from "../scraping/scrapers/video/video.repository.js";
import { formatCount } from "./task-run-messages.js";
import { formatTasksOverview, type TaskOverview } from "./tasks-overview.js";
import { TelegramController } from "./telegram-controller.js";

/**
 * Reads a running run's progress from the data its task changes, through a
 * query in the feature module that owns that data. A query that fails says so
 * in its line rather than throwing, so `/tasks` still lists every run.
 */
type FetchProgressLine = () => Promise<string>;

@injectable()
export class TasksController implements TelegramController {
  private readonly progressLineFetchers: ReadonlyMap<string, FetchProgressLine>;

  constructor(
    private readonly logger: Logger,
    private readonly requestRecalculatePrioritiesUseCase: RequestRecalculatePrioritiesUseCase,
    private readonly requestReprocessCaptionsUseCase: RequestReprocessCaptionsUseCase,
    private readonly requestRebuildSearchIndexUseCase: RequestRebuildSearchIndexUseCase,
    private readonly taskQueue: TaskQueue,
    private readonly videoRepository: VideoRepository,
    private readonly searchIndexes: SearchIndexes,
  ) {
    this.logger.setContext(TasksController.name);
    this.progressLineFetchers = new Map([
      [TASKS.REPROCESS_CAPTIONS.name, () => this.videosLeftToReprocess()],
      [TASKS.REBUILD_SEARCH_INDEX.name, () => this.rebuildProgressLine()],
    ]);
  }

  public register(bot: Telegraf): void {
    this.registerRequest(
      bot,
      "recalculate_priorities",
      TASKS.RECALCULATE_PRIORITIES,
      () => this.requestRecalculatePrioritiesUseCase.execute(),
    );
    this.registerRequest(
      bot,
      "reprocess_captions",
      TASKS.REPROCESS_CAPTIONS,
      () => this.requestReprocessCaptionsUseCase.execute(),
    );
    this.registerRequest(
      bot,
      "rebuild_search_index",
      TASKS.REBUILD_SEARCH_INDEX,
      () => this.requestRebuildSearchIndexUseCase.execute(),
    );
    this.registerOverview(bot);
  }

  private registerRequest(
    bot: Telegraf,
    command: string,
    task: AnyTask,
    request: () => ReturnType<TaskQueue["request"]>,
  ): void {
    bot.command(command, async (ctx) => {
      this.logger.info(`Received /${command} command`);

      const result = await request();
      if (!result.ok) {
        switch (result.error.type) {
          case "TASK_ALREADY_RUNNING":
            await ctx.reply(`${task.name} is already running.`);
            return;

          case "TASK_NOT_SET_UP":
            await ctx.reply(
              `${task.name} can't be requested until its worker has started once.`,
            );
            return;

          case "DATABASE":
            this.logger.error({
              message: `Failed to request ${task.name}`,
              error: result.error.error,
            });
            await ctx.reply("Issue with database.");
            return;
        }
      }

      await ctx.reply(`${task.name} requested. Run id: ${result.value}`);
    });
  }

  private registerOverview(bot: Telegraf): void {
    bot.command("tasks", async (ctx) => {
      this.logger.info("Received /tasks command");

      const tasks = Object.values(TASKS);
      const result = await this.taskQueue.latestRuns(tasks);
      if (!result.ok) {
        this.logger.error({
          message: "Failed to read the latest runs",
          error: result.error.error,
        });
        await ctx.reply("Issue with database.");
        return;
      }

      const overviews = await Promise.all(
        tasks.map(async (task): Promise<TaskOverview> => {
          const latestRun = result.value.find((run) => run.task === task.name);
          const fetchProgressLine = this.progressLineFetchers.get(task.name);
          const progress =
            fetchProgressLine && latestRun?.state === "running"
              ? await fetchProgressLine()
              : undefined;
          return { task: task.name, latestRun, progress };
        }),
      );

      await ctx.reply(formatTasksOverview(overviews, new Date()));
    });
  }

  private async videosLeftToReprocess(): Promise<string> {
    const result = await this.videoRepository.countVideosForReprocessing();
    if (!result.ok) {
      this.logger.error({
        message: "Failed to count the videos left to reprocess",
        error: result.error.error,
      });
      return "Videos left: unknown, the count failed.";
    }
    return `Videos left: ${result.value}`;
  }

  private async rebuildProgressLine(): Promise<string> {
    const result = await this.searchIndexes.rebuildProgress();
    if (!result.ok) {
      this.logger.error({
        message: "Failed to read the rebuild's progress",
        error: result.error.error,
      });
      return "Progress unavailable: Elasticsearch did not answer.";
    }
    if (!result.value) {
      return "No new index yet.";
    }
    const { indexed, liveSize } = result.value;
    const of =
      liveSize === null
        ? ""
        : ` of about ${formatCount(liveSize)} in the live index`;
    return `Indexed ${formatCount(indexed)}${of}.`;
  }
}
