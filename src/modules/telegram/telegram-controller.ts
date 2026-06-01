import type { Telegraf } from "telegraf";

export interface TelegramController {
  register(bot: Telegraf): void;
}
