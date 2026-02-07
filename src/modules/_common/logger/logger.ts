import * as fs from "fs";
import { injectable } from "inversify";

type Config = {
  context?: string;
  category?: string;
};

@injectable()
export class Logger {
  private context: string;
  private logsDir = "logs";
  private category: string;

  constructor({ context = "default", category = "default" }: Config) {
    this.context = this.toKebabCase(context);
    this.category = this.toKebabCase(category);

    if (!fs.existsSync(this.logsDir)) {
      fs.mkdirSync(this.logsDir);
    }
  }

  public setContext(context: string): void {
    this.context = this.context + ":" + this.toKebabCase(context);
  }

  public info(message: string): void {
    const log = `${this.getTimestamp()} [info]\n[${this.context}]\n${message}\n`;

    console.log(log);
    fs.appendFileSync(this.getLogsFilePath(), log + "\n");
  }

  public error({
    message,
    error,
    context,
  }: {
    message?: string;
    error?: unknown;
    context?: Record<string, unknown>;
  }): void {
    const timestamp = this.getTimestamp();
    const errorMessage = message ?? (error instanceof Error ? error.message : undefined);

    let log = `${timestamp} [error]\n[${this.context}]\n${errorMessage}`;
    if (error instanceof Error) {
      log += `\nstack: ${error.stack}`;
      log += `\ncause: ${error.cause}`;
      if ("context" in error) {
        log += `\nerror.context: ${this.stringifyContext(error.context)}`;
      }
    }

    if (context) {
      log += `\ncontext: ${this.stringifyContext(context)}`;
    }

    console.error(log);
    fs.appendFileSync(this.getLogsFilePath(), log + "\n");
  }

  public warn(message: string): void {
    const log = `${this.getTimestamp()} [warn]\n[${this.context}]\n${message}\n`;

    console.warn(log);
    fs.appendFileSync(this.category, log + "\n");
  }

  private getTimestamp(): string {
    return new Date().toISOString();
  }

  private getLogsFilePath(): string {
    return `${this.logsDir}/${this.category}`;
  }

  private stringifyContext(context: unknown): string {
    return typeof context === "object"
      ? JSON.stringify(context, null, 2)
      : String(context);
  }

  private toKebabCase(str: string): string {
    return str
      .replace(/([a-z0-9])([A-Z])/g, "$1-$2") // insert - between lower/number and upper
      .replace(/([A-Z])([A-Z][a-z])/g, "$1-$2") // handle multiple capitals (e.g. XMLParser -> xml-parser)
      .toLowerCase();
  }
}
