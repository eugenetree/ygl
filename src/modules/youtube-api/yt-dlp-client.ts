import { injectable } from "inversify";
import * as path from "node:path";
import { YtDlp as YtDlpWrapper } from "ytdlp-nodejs";

import { Logger } from "../_common/logger/logger.js";
import { Failure, Result, Success } from "../../types/index.js";

export type YtDlpError = { type: "YT_DLP_ERROR"; message: string; cause?: unknown };
export type MembersOnlyVideoError = { type: "MEMBERS_ONLY_VIDEO"; message: string };

const MEMBERS_ONLY_MESSAGE = "Join this channel to get access to members-only content";

function isMembersOnlyError(message: string): boolean {
  return message.includes(MEMBERS_ONLY_MESSAGE);
}

@injectable()
export class YtDlpClient {
  private ytdlp: YtDlpWrapper;

  constructor(private readonly logger: Logger) {
    this.logger.setContext(YtDlpClient.name);

    // ytdlp-nodejs will automatically find/download its own version of the binary
    this.ytdlp = new YtDlpWrapper();
  }

  /**
   * Executes yt-dlp with the specified arguments and parses each line of stdout as a JSON object of type T.
   */
  async execJson<T>(args: string[]): Promise<Result<T[], YtDlpError | MembersOnlyVideoError>> {
    try {
      this.logger.info(`Running yt-dlp via wrapper with args: ${args.join(" ")}`);

      const [url, ...remainingArgs] = args;
      if (!url) {
        return Failure({ type: "YT_DLP_ERROR", message: "URL/Query is required as the first argument" });
      }

      // We use the raw execBuilder to have full control over the arguments
      const builder = this.ytdlp.execBuilder(url).addArgs(...remainingArgs);

      // Disable command line printing to stderr to reduce noise
      builder.debugPrint(false);

      const result = await builder.exec();

      if (result.exitCode !== 0) {
        const message = result.stderr || `Exit code ${result.exitCode}`;
        if (isMembersOnlyError(message)) {
          return Failure({ type: "MEMBERS_ONLY_VIDEO", message });
        }
        this.logger.error({
          message: `yt-dlp execution failed with code ${result.exitCode}`,
          context: { stderr: result.stderr, command: result.command }
        });
        return Failure({ type: "YT_DLP_ERROR", message });
      }

      const results: T[] = [];
      const lines = result.output.split("\n");

      for (const line of lines) {
        if (line.trim()) {
          try {
            results.push(JSON.parse(line));
          } catch {
            this.logger.warn(`Failed to parse yt-dlp output line: ${line}`);
          }
        }
      }

      return Success(results);
    } catch (error: any) {
      const errorContext = {
        name: error?.name,
        message: error?.message,
        stack: error?.stack,
        ...error
      };

      this.logger.error({
        message: "Unexpected error during yt-dlp execution",
        context: errorContext
      });

      const message = error?.message || "Unexpected error";
      if (isMembersOnlyError(message)) {
        return Failure({ type: "MEMBERS_ONLY_VIDEO", message });
      }

      return Failure({
        type: "YT_DLP_ERROR",
        message,
        cause: errorContext
      });
    }
  }

  /**
   * Executes yt-dlp with the specified arguments without parsing output.
   * Useful for commands that write to files (e.g., subtitle downloads).
   */
  async exec(args: string[]): Promise<Result<void, YtDlpError | MembersOnlyVideoError>> {
    try {
      this.logger.info(`Running yt-dlp via wrapper with args: ${args.join(" ")}`);

      const [url, ...remainingArgs] = args;
      if (!url) {
        return Failure({ type: "YT_DLP_ERROR", message: "URL/Query is required as the first argument" });
      }

      const builder = this.ytdlp.execBuilder(url).addArgs(...remainingArgs);
      builder.debugPrint(false);

      const result = await builder.exec();

      if (result.exitCode !== 0) {
        const message = result.stderr || `Exit code ${result.exitCode}`;
        if (isMembersOnlyError(message)) {
          return Failure({ type: "MEMBERS_ONLY_VIDEO", message });
        }
        this.logger.error({
          message: `yt-dlp execution failed with code ${result.exitCode}`,
          context: { stderr: result.stderr, command: result.command }
        });
        return Failure({ type: "YT_DLP_ERROR", message });
      }

      return Success(undefined);
    } catch (error: any) {
      const errorContext = {
        name: error?.name,
        message: error?.message,
        stack: error?.stack,
        ...error
      };

      this.logger.error({
        message: "Unexpected error during yt-dlp execution",
        context: errorContext
      });

      const message = error?.message || "Unexpected error";
      if (isMembersOnlyError(message)) {
        return Failure({ type: "MEMBERS_ONLY_VIDEO", message });
      }

      return Failure({
        type: "YT_DLP_ERROR",
        message,
        cause: errorContext
      });
    }
  }

  /**
   * Executes yt-dlp with the specified arguments and yields each line of stdout as a JSON object of type T.
   */
  async *execJsonStream<T>(args: string[]): AsyncGenerator<Result<T, YtDlpError>, void, undefined> {
    try {
      this.logger.info(`Running yt-dlp via wrapper with args (streaming): ${args.join(" ")}`);

      const [url, ...remainingArgs] = args;
      if (!url) {
        yield Failure({ type: "YT_DLP_ERROR", message: "URL/Query is required as the first argument" });
        return;
      }

      const builder = this.ytdlp.execBuilder(url).addArgs(...remainingArgs);
      builder.debugPrint(false);

      let errorResult: YtDlpError | undefined;
      const queue: T[] = [];
      let done = false;
      let resolveNext: (() => void) | undefined;

      let buffer = "";
      builder.on("stdout", (chunk: string) => {
        buffer += chunk;
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.trim()) {
            try {
              queue.push(JSON.parse(line));
              resolveNext?.();
            } catch {
              this.logger.warn(`Failed to parse yt-dlp output line: ${line}`);
            }
          }
        }
      });

      builder.on("error", (error: Error) => {
        errorResult = { type: "YT_DLP_ERROR", message: error.message, cause: error };
        done = true;
        resolveNext?.();
      });

      const execPromise = builder.exec().then((result) => {
        if (buffer.trim()) {
          try {
            queue.push(JSON.parse(buffer));
          } catch {
            this.logger.warn(`Failed to parse final yt-dlp output line: ${buffer}`);
          }
        }

        if (result.exitCode !== 0 && !errorResult) {
          errorResult = { type: "YT_DLP_ERROR", message: result.stderr || `Exit code ${result.exitCode}` };
        }
        done = true;
        resolveNext?.();
      });

      while (!done || queue.length > 0) {
        if (queue.length > 0) {
          yield Success(queue.shift()!);
        } else {
          await new Promise<void>((resolve) => {
            resolveNext = resolve;
          });
          resolveNext = undefined;
        }

        if (errorResult) {
          yield Failure(errorResult);
          return;
        }
      }

      await execPromise;
    } catch (error: any) {
      const errorContext = {
        name: error?.name,
        message: error?.message,
        stack: error?.stack,
        ...error
      };
      this.logger.error({
        message: "Unexpected error during yt-dlp streaming execution",
        context: errorContext
      });
      yield Failure({
        type: "YT_DLP_ERROR",
        message: error?.message || "Unexpected error",
        cause: errorContext
      });
    }
  }
}

