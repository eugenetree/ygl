import { injectable } from "inversify";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { YtDlp as YtDlpWrapper } from "ytdlp-nodejs";

import { Logger } from "../_common/logger/logger.js";
import { Failure, Result, Success } from "../../types/index.js";

export type YtDlpError = { type: "YT_DLP_ERROR"; message: string; cause?: unknown };
export type MembersOnlyVideoError = { type: "MEMBERS_ONLY_VIDEO"; message: string };
export type GeoRestrictedVideoError = { type: "GEO_RESTRICTED_VIDEO"; message: string };
export type AgeRestrictedVideoError = { type: "AGE_RESTRICTED_VIDEO"; message: string };
export type PremiereVideoError = { type: "PREMIERE_VIDEO"; message: string };
export type UnprocessableVideoError = MembersOnlyVideoError | GeoRestrictedVideoError | AgeRestrictedVideoError | PremiereVideoError;

const MEMBERS_ONLY_MESSAGE = "Join this channel to get access to members-only content";
const GEO_RESTRICTED_MESSAGE = "The uploader has not made this video available in your country";
const AGE_RESTRICTED_MESSAGE = "Sign in to confirm your age";
const PREMIERE_MESSAGE = "Premieres in";

function classifyUnprocessable(message: string): UnprocessableVideoError | null {
  if (message.includes(MEMBERS_ONLY_MESSAGE)) {
    return { type: "MEMBERS_ONLY_VIDEO", message };
  }
  if (message.includes(GEO_RESTRICTED_MESSAGE)) {
    return { type: "GEO_RESTRICTED_VIDEO", message };
  }
  if (message.includes(AGE_RESTRICTED_MESSAGE)) {
    return { type: "AGE_RESTRICTED_VIDEO", message };
  }
  if (message.includes(PREMIERE_MESSAGE)) {
    return { type: "PREMIERE_VIDEO", message };
  }
  return null;
}

function resolveCookiesFile(logger: Logger): string | undefined {
  const cookiesB64 = process.env["YTDLP_COOKIES_B64"];
  if (!cookiesB64) return undefined;

  const tmpPath = path.join(os.tmpdir(), "ytdlp-cookies.txt");
  fs.writeFileSync(tmpPath, Buffer.from(cookiesB64, "base64"));
  logger.info(`Decoded YTDLP_COOKIES_B64 to temporary cookies file: ${tmpPath}`);
  return tmpPath;
}

@injectable()
export class YtDlpClient {
  private ytdlp: YtDlpWrapper;
  private readonly cookiesFile: string | undefined;

  constructor(private readonly logger: Logger) {
    this.logger.setContext(YtDlpClient.name);

    // ytdlp-nodejs will automatically find/download its own version of the binary
    this.ytdlp = new YtDlpWrapper();
    this.cookiesFile = resolveCookiesFile(this.logger);
  }

  private buildExec(url: string, remainingArgs: string[]) {
    const allArgs = this.cookiesFile ? ["--cookies", this.cookiesFile, ...remainingArgs] : remainingArgs;
    const builder = this.ytdlp.execBuilder(url).addArgs(...allArgs);
    builder.debugPrint(false);
    return builder;
  }

  /**
   * Executes yt-dlp with the specified arguments and parses each line of stdout as a JSON object of type T.
   */
  async execJson<T>(args: string[]): Promise<Result<T[], YtDlpError | UnprocessableVideoError>> {
    try {
      this.logger.info(`Running yt-dlp via wrapper with args: ${args.join(" ")}`);

      const [url, ...remainingArgs] = args;
      if (!url) {
        return Failure({ type: "YT_DLP_ERROR", message: "URL/Query is required as the first argument" });
      }

      // We use the raw execBuilder to have full control over the arguments
      const builder = this.buildExec(url, remainingArgs);
      const result = await builder.exec();

      if (result.exitCode !== 0) {
        const message = result.stderr || `Exit code ${result.exitCode}`;
        const unprocessable = classifyUnprocessable(message);
        if (unprocessable) {
          return Failure(unprocessable);
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
      const unprocessable = classifyUnprocessable(message);
      if (unprocessable) {
        return Failure(unprocessable);
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
  async exec(args: string[]): Promise<Result<void, YtDlpError | UnprocessableVideoError>> {
    try {
      this.logger.info(`Running yt-dlp via wrapper with args: ${args.join(" ")}`);

      const [url, ...remainingArgs] = args;
      if (!url) {
        return Failure({ type: "YT_DLP_ERROR", message: "URL/Query is required as the first argument" });
      }

      const builder = this.buildExec(url, remainingArgs);
      const result = await builder.exec();

      if (result.exitCode !== 0) {
        const message = result.stderr || `Exit code ${result.exitCode}`;
        const unprocessable = classifyUnprocessable(message);
        if (unprocessable) {
          return Failure(unprocessable);
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
      const unprocessable = classifyUnprocessable(message);
      if (unprocessable) {
        return Failure(unprocessable);
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

      const builder = this.buildExec(url, remainingArgs);

      let errorResult: YtDlpError | undefined;
      const queue: T[] = [];
      let done = false;
      let resolveNext: (() => void) | undefined;

      let stderrBuffer = "";
      builder.on("stderr", (chunk: string) => {
        stderrBuffer += chunk;
      });

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
        errorResult = { 
            type: "YT_DLP_ERROR", 
            message: error.message, 
            cause: { originalError: error, stderr: stderrBuffer } 
        };
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
      }).catch((error) => {
        if (!errorResult) {
          errorResult = { 
              type: "YT_DLP_ERROR", 
              message: error.message || "Unknown error during yt-dlp execution", 
              cause: { originalError: error, stderr: stderrBuffer } 
          };
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

