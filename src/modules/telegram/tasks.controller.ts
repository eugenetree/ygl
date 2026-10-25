import { injectable } from "inversify";
import { Telegraf } from "telegraf";

import { Logger } from "../_common/logger/logger.js";
import {
  type AnyTask,
  recalculatePriorities,
} from "../_common/tasks/task-definitions.js";
import { Tasks } from "../_common/tasks/tasks.js";
import { TelegramController } from "./telegram-controller.js";

@injectable()
export class TasksController implements TelegramController {
  constructor(
    private readonly logger: Logger,
    private readonly tasks: Tasks,
  ) {
    this.logger.setContext(TasksController.name);
  }

  public register(bot: Telegraf): void {
    this.registerRequest(bot, "recalculate_priorities", recalculatePriorities);
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
}
