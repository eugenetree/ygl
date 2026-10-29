import { injectable } from "inversify";
import { Telegraf } from "telegraf";

import type { DatabaseError } from "../../db/types.js";
import type { Result } from "../../types/index.js";
import { Logger } from "../_common/logger/logger.js";
import { TASKS } from "../_common/messaging/definitions.js";
import type { AnyTask, TaskQueue } from "../_common/messaging/task-queue.js";
import type { SearchUnavailableError } from "../captions-search/captions.service.js";
import { GetRebuildSearchIndexStatusUseCase } from "../captions-search/get-rebuild-search-index-status.use-case.js";
import { RequestRebuildSearchIndexUseCase } from "../captions-search/request-rebuild-search-index.use-case.js";
import type { RebuildProgress } from "../captions-search/search-indexes.js";
import { GetRecalculatePrioritiesStatusUseCase } from "../scraping/channel-priority/get-recalculate-priorities-status.use-case.js";
import { RequestRecalculatePrioritiesUseCase } from "../scraping/channel-priority/request-recalculate-priorities.use-case.js";
import { GetReprocessCaptionsStatusUseCase } from "../scraping/scrapers/video/use-cases/reprocess-captions/get-reprocess-captions-status.use-case.js";
import { RequestReprocessCaptionsUseCase } from "../scraping/scrapers/video/use-cases/reprocess-captions/request-reprocess-captions.use-case.js";
import { formatCount } from "./task-run-messages.js";
import { formatTasksOverview, type TaskOverview } from "./tasks-overview.js";
import { TelegramController } from "./telegram-controller.js";

@injectable()
export class TasksController implements TelegramController {
  constructor(
    private readonly logger: Logger,
    private readonly requestRecalculatePrioritiesUseCase: RequestRecalculatePrioritiesUseCase,
    private readonly requestReprocessCaptionsUseCase: RequestReprocessCaptionsUseCase,
    private readonly requestRebuildSearchIndexUseCase: RequestRebuildSearchIndexUseCase,
    private readonly getRecalculatePrioritiesStatusUseCase: GetRecalculatePrioritiesStatusUseCase,
    private readonly getReprocessCaptionsStatusUseCase: GetReprocessCaptionsStatusUseCase,
    private readonly getRebuildSearchIndexStatusUseCase: GetRebuildSearchIndexStatusUseCase,
  ) {
    this.logger.setContext(TasksController.name);
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

      const [recalculate, reprocess, rebuild] = await Promise.all([
        this.getRecalculatePrioritiesStatusUseCase.execute(),
        this.getReprocessCaptionsStatusUseCase.execute(),
        this.getRebuildSearchIndexStatusUseCase.execute(),
      ]);
      if (!recalculate.ok || !reprocess.ok || !rebuild.ok) {
        for (const status of [recalculate, reprocess, rebuild]) {
          if (!status.ok) {
            this.logger.error({
              message: "Failed to read the latest runs",
              error: status.error.error,
            });
          }
        }
        await ctx.reply("Issue with database.");
        return;
      }

      const overviews: TaskOverview[] = [
        {
          task: TASKS.RECALCULATE_PRIORITIES.name,
          latestRun: recalculate.value.latestRun,
        },
        {
          task: TASKS.REPROCESS_CAPTIONS.name,
          latestRun: reprocess.value.latestRun,
          progress:
            reprocess.value.videosLeft &&
            this.videosLeftLine(reprocess.value.videosLeft),
        },
        {
          task: TASKS.REBUILD_SEARCH_INDEX.name,
          latestRun: rebuild.value.latestRun,
          progress:
            rebuild.value.progress &&
            this.rebuildProgressLine(rebuild.value.progress),
        },
      ];
      await ctx.reply(formatTasksOverview(overviews, new Date()));
    });
  }

  // A progress read that fails says so in its line rather than failing the
  // reply, so `/tasks` still lists every run.
  private videosLeftLine(videosLeft: Result<number, DatabaseError>): string {
    if (!videosLeft.ok) {
      this.logger.error({
        message: "Failed to count the videos left to reprocess",
        error: videosLeft.error.error,
      });
      return "Videos left: unknown, the count failed.";
    }
    return `Videos left: ${videosLeft.value}`;
  }

  private rebuildProgressLine(
    progress: Result<RebuildProgress | null, SearchUnavailableError>,
  ): string {
    if (!progress.ok) {
      this.logger.error({
        message: "Failed to read the rebuild's progress",
        error: progress.error.error,
      });
      return "Progress unavailable: Elasticsearch did not answer.";
    }
    if (!progress.value) {
      return "No new index yet.";
    }
    const { indexed, liveSize } = progress.value;
    const of =
      liveSize === null
        ? ""
        : ` of about ${formatCount(liveSize)} in the live index`;
    return `Indexed ${formatCount(indexed)}${of}.`;
  }
}
