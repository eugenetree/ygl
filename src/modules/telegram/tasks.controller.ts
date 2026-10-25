import { injectable } from "inversify";
import { Telegraf } from "telegraf";

import { Logger } from "../_common/logger/logger.js";
import {
  type AnyTask,
  rebuildSearchIndex,
  recalculatePriorities,
  TASKS,
} from "../_common/tasks/task-definitions.js";
import { Tasks } from "../_common/tasks/tasks.js";
import { SearchIndexes } from "../captions-search/search-indexes.js";
import { formatTasksOverview, type TaskOverview } from "./tasks-overview.js";
import { TelegramController } from "./telegram-controller.js";

/**
 * Reads a running run's progress from the data its task changes, through a
 * query in the feature module that owns that data. A query that fails says so
 * in its line rather than throwing, so `/tasks` still lists every run.
 */
type ProgressLine = () => Promise<string>;

@injectable()
export class TasksController implements TelegramController {
  private readonly progressLines: ReadonlyMap<string, ProgressLine> = new Map([
    [rebuildSearchIndex.name, () => this.rebuildProgressLine()],
  ]);

  constructor(
    private readonly logger: Logger,
    private readonly tasks: Tasks,
    private readonly searchIndexes: SearchIndexes,
  ) {
    this.logger.setContext(TasksController.name);
  }

  public register(bot: Telegraf): void {
    this.registerRequest(bot, "recalculate_priorities", recalculatePriorities);
    this.registerRequest(bot, "rebuild_search_index", rebuildSearchIndex);
    this.registerOverview(bot);
  }

  private registerRequest(bot: Telegraf, command: string, task: AnyTask): void {
    bot.command(command, async (ctx) => {
      this.logger.info(`Received /${command} command`);

      const result = await this.tasks.request(task, {});
      if (!result.ok) {
        switch (result.error.type) {
          case "TASK_ALREADY_RUNNING":
            await ctx.reply(`${task.name} is already running.`);
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

      const result = await this.tasks.latestRuns();
      if (!result.ok) {
        this.logger.error({
          message: "Failed to read the latest runs",
          error: result.error.error,
        });
        await ctx.reply("Issue with database.");
        return;
      }

      const overviews = await Promise.all(
        TASKS.map(async (task): Promise<TaskOverview> => {
          const latestRun = result.value.find((run) => run.task === task.name);
          const progressLine = this.progressLines.get(task.name);
          const progress =
            progressLine && latestRun?.state === "running"
              ? await progressLine()
              : undefined;
          return { task: task.name, latestRun, progress };
        }),
      );

      await ctx.reply(formatTasksOverview(overviews, new Date()));
    });
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
        : ` of about ${liveSize.toLocaleString("en-US")} in the live index`;
    return `Indexed ${indexed.toLocaleString("en-US")}${of}.`;
  }
}
