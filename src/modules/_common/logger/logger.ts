import { injectable } from "inversify";

type Config = {
  context?: string;
  category?: string;
};

@injectable()
export class Logger {
  private context: string; // service-specific marker
  private category: string; // overall category, like "videos-scraper"

  constructor({ context = "default", category = "default" }: Config) {
    this.context = this.toKebabCase(context);
    this.category = this.toKebabCase(category);
  }

  public setContext(context: string): void {
    this.context = this.context + ":" + this.toKebabCase(context);
  }

  public child(config: Config): Logger {
    return new Logger({
      context: config.context ?? this.context,
      category: config.category ?? this.category,
    });
  }

  public info(message: string): void {
    const log = `${this.header("info")}\n${message}\n`;

    console.log(log);
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
    const errorMessage =
      message ?? (error instanceof Error ? error.message : undefined);

    let log = `${this.header("error")}\n${errorMessage}`;

    if (error instanceof Error) {
      log += `\nstack: ${error.stack}`;
      log += `\ncause: ${this.serializeCause(error.cause)}`;
      if ("context" in error) {
        log += `\nerror.context: ${this.stringifyContext(error.context)}`;
      }
    } else {
      log += `\nerror: ${JSON.stringify(error)}`;
    }

    if (context) {
      log += `\ncontext: ${this.stringifyContext(context)}`;
    }

    console.error(log);
  }

  public warn(message: string): void {
    const log = `${this.header("warn")}\n${message}\n`;

    console.warn(log);
  }

  private header(level: "info" | "warn" | "error"): string {
    return `${new Date().toISOString()} [${level}] [${this.category}]\n[${this.context}]`;
  }

  /**
   * Serializes an `error.cause` structurally so the actionable underlying
   * detail survives. Node/undici's `TypeError: fetch failed` carries an
   * `AggregateError` cause whose `.errors[]` hold the real network codes
   * (`ENETUNREACH`/`ENOTFOUND`/`ECONNREFUSED`/`ETIMEDOUT`) plus address/port.
   * Template interpolation would collapse all of that to `"AggregateError"`.
   */
  private serializeCause(cause: unknown): string {
    if (!(cause instanceof Error)) {
      return this.stringifyContext(cause);
    }

    let serialized = `${cause.name}: ${cause.message}`;

    const errors = (cause as { errors?: unknown }).errors;
    if (Array.isArray(errors)) {
      const inner = errors
        .map(
          (entry, index) => `  [${index}] ${this.serializeInnerError(entry)}`,
        )
        .join("\n");
      serialized += `\n  errors:\n${inner}`;
    }

    return serialized;
  }

  private serializeInnerError(error: unknown): string {
    if (!(error instanceof Error)) {
      return this.stringifyContext(error);
    }

    const parts = [`${error.name}: ${error.message}`];

    // Log every own-enumerable property (Node system errors carry
    // code/errno/syscall/address/port; other error shapes may carry
    // statusCode/hostname/etc.) so we never silently discard detail. This is
    // intentionally verbose for now — we can trim noise later if needed.
    const details = Object.entries(
      error as unknown as Record<string, unknown>,
    ).map(([key, value]) => `${key}=${String(value)}`);
    if (details.length > 0) {
      parts.push(`(${details.join(", ")})`);
    }

    return parts.join(" ");
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
