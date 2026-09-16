import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { inject, injectable, optional } from "inversify";
import { YtDlp as YtDlpWrapper } from "ytdlp-nodejs";
import { Failure, type Result, Success } from "../../types/index.js";
import { Logger } from "../_common/logger/logger.js";

export type YtDlpError = {
  type: "YT_DLP_ERROR";
  message: string;
  cause?: unknown;
};
export type MembersOnlyVideoError = {
  type: "MEMBERS_ONLY_VIDEO";
  message: string;
};
export type GeoRestrictedVideoError = {
  type: "GEO_RESTRICTED_VIDEO";
  message: string;
};
export type AgeRestrictedVideoError = {
  type: "AGE_RESTRICTED_VIDEO";
  message: string;
};
export type PremiereVideoError = { type: "PREMIERE_VIDEO"; message: string };
export type RemovedByUploaderVideoError = {
  type: "REMOVED_BY_UPLOADER_VIDEO";
  message: string;
};
export type ClaimedContentVideoError = {
  type: "CLAIMED_CONTENT_VIDEO";
  message: string;
};
export type UnprocessableVideoError =
  | MembersOnlyVideoError
  | GeoRestrictedVideoError
  | AgeRestrictedVideoError
  | PremiereVideoError
  | RemovedByUploaderVideoError
  | ClaimedContentVideoError;

const MEMBERS_ONLY_MESSAGE =
  "Join this channel to get access to members-only content";
const GEO_RESTRICTED_MESSAGE =
  "The uploader has not made this video available in your country";
const AGE_RESTRICTED_MESSAGES = [
  "Sign in to confirm your age",
  "Take a few minutes to verify your age",
];
const PREMIERE_MESSAGE = "Premieres in";
const REMOVED_BY_UPLOADER_MESSAGE =
  "This video has been removed by the uploader";
const CLAIMED_CONTENT_MESSAGE = "blocked due to the claimed content";
/** YouTube distrusts the requester (IP reputation / missing PO token), not the video. */
const BOT_CHALLENGE_PATTERN = /Sign in to confirm you.re not a bot/;

/**
 * Pacing yt-dlp applies inside one invocation, per the yt-dlp wiki's advice
 * for staying under YouTube's rate limit (~300 videos/h as a guest): a pause
 * between its HTTP requests and before each subtitle download. The pause
 * between videos lives in the worker loop.
 */
const SLEEP_BETWEEN_REQUESTS_S = "0.75";
const SLEEP_BEFORE_SUBTITLES_S = "5";

/** Max time to wait for `yt-dlp --version` before giving up (keeps boot unblocked). */
const VERSION_RESOLUTION_TIMEOUT_MS = 5_000;

export type YtDlpRunResult = {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  command?: string;
};

/**
 * The boundary to the yt-dlp process: receives the fully composed argument
 * list and resolves with what the process produced, including a non-zero
 * exit (with its stderr). Rejects only when the process cannot be run at
 * all. Injected in tests.
 */
export type YtDlpRunner = (
  url: string,
  args: string[],
) => Promise<YtDlpRunResult>;
export const YT_DLP_RUNNER = Symbol.for("YT_DLP_RUNNER");

export function classifyUnprocessable(
  message: string,
): UnprocessableVideoError | null {
  if (message.includes(MEMBERS_ONLY_MESSAGE)) {
    return { type: "MEMBERS_ONLY_VIDEO", message };
  }
  if (message.includes(GEO_RESTRICTED_MESSAGE)) {
    return { type: "GEO_RESTRICTED_VIDEO", message };
  }
  if (AGE_RESTRICTED_MESSAGES.some((m) => message.includes(m))) {
    return { type: "AGE_RESTRICTED_VIDEO", message };
  }
  if (message.includes(PREMIERE_MESSAGE)) {
    return { type: "PREMIERE_VIDEO", message };
  }
  if (message.includes(REMOVED_BY_UPLOADER_MESSAGE)) {
    return { type: "REMOVED_BY_UPLOADER_VIDEO", message };
  }
  if (message.includes(CLAIMED_CONTENT_MESSAGE)) {
    return { type: "CLAIMED_CONTENT_VIDEO", message };
  }
  return null;
}

/**
 * Maps a yt-dlp failure message to the error the caller should see: a skip
 * cause when the video itself is unprocessable, otherwise a YT_DLP_ERROR —
 * with the bot challenge called out, since it means the scraper's IP/session
 * is being rejected and every following video would fail the same way.
 */
function toYtDlpFailure(
  message: string,
  cause?: unknown,
): YtDlpError | UnprocessableVideoError {
  return classifyUnprocessable(message) ?? toYtDlpError(message, cause);
}

function toYtDlpError(message: string, cause?: unknown): YtDlpError {
  if (BOT_CHALLENGE_PATTERN.test(message)) {
    return {
      type: "YT_DLP_ERROR",
      message: `YouTube bot challenge: the scraper's IP/session is not trusted (check the VPN exit, the PO token provider and the cookies). ${message}`,
      cause,
    };
  }
  return { type: "YT_DLP_ERROR", message, cause };
}

function resolveCookiesFile(logger: Logger): string | undefined {
  const cookiesB64 = process.env["YTDLP_COOKIES_B64"];
  if (!cookiesB64) return undefined;

  const tmpPath = path.join(os.tmpdir(), "ytdlp-cookies.txt");
  fs.writeFileSync(tmpPath, Buffer.from(cookiesB64, "base64"));
  logger.info(
    `Decoded YTDLP_COOKIES_B64 to temporary cookies file: ${tmpPath}`,
  );
  return tmpPath;
}

@injectable()
export class YtDlpClient {
  private ytdlp: YtDlpWrapper;
  private readonly cookiesFile: string | undefined;
  private readonly potProviderUrl: string | undefined;
  private readonly run: YtDlpRunner;

  // The runner is a function type, so it needs an explicit token: without
  // `@inject` inversify would try to resolve `Function` from its metadata.
  constructor(
    private readonly logger: Logger,
    @optional() @inject(YT_DLP_RUNNER) runner?: YtDlpRunner,
  ) {
    this.logger.setContext(YtDlpClient.name);

    // ytdlp-nodejs will automatically find/download its own version of the binary
    this.ytdlp = new YtDlpWrapper();
    this.cookiesFile = resolveCookiesFile(this.logger);
    this.potProviderUrl = process.env["YTDLP_POT_PROVIDER_URL"] || undefined;
    this.run = runner ?? ((url, args) => this.runWithWrapper(url, args));
  }

  /**
   * Returns the version of the yt-dlp binary in use, or undefined if it
   * cannot be resolved. Safe to call at startup.
   */
  async getVersion(): Promise<string | undefined> {
    // NOTE: We deliberately do NOT call `this.ytdlp.getVersionAsync()`. In
    // ytdlp-nodejs@3.4.4 that method invokes the binary with an empty URL plus
    // `--version`, but the wrapper's arg builder throws "URL is required." on an
    // empty URL — so version resolution can never succeed and always logs
    // `unknown`. We invoke the binary directly with `--version` instead. Do not
    // "simplify" this back to the wrapper method until the upstream bug is fixed.
    try {
      return await this.resolveVersionFromBinary();
    } catch (error) {
      this.logger.warn(
        `Failed to resolve yt-dlp version: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return undefined;
    }
  }

  /**
   * Spawns the yt-dlp binary with `--version` and resolves its trimmed stdout.
   * Uses the same binary the wrapper runs extractions with when it exposes a
   * usable path; otherwise falls back to `yt-dlp` on PATH (the scraper image
   * symlinks the wrapper's binary onto PATH). Never a hardcoded absolute path.
   * Bounded by a timeout so a wedged binary can't stall startup.
   */
  private resolveVersionFromBinary(): Promise<string> {
    const binary = this.ytdlp.binaryPath || "yt-dlp";

    return new Promise((resolve, reject) => {
      const child = spawn(binary, ["--version"]);
      let stdout = "";
      let stderr = "";
      let settled = false;

      const settle = (fn: () => void) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        fn();
      };

      const timer = setTimeout(() => {
        settle(() => {
          child.kill("SIGKILL");
          reject(
            new Error(
              `Timed out after ${VERSION_RESOLUTION_TIMEOUT_MS}ms resolving version`,
            ),
          );
        });
      }, VERSION_RESOLUTION_TIMEOUT_MS);
      timer.unref?.();

      child.stdout?.on("data", (chunk) => {
        stdout += chunk.toString();
      });
      child.stderr?.on("data", (chunk) => {
        stderr += chunk.toString();
      });
      child.on("error", (error) => settle(() => reject(error)));
      child.on("close", (code) => {
        settle(() => {
          if (code === 0) {
            // yt-dlp prints just the version (e.g. `2025.01.15`) + newline.
            resolve(stdout.trim());
          } else {
            reject(new Error(stderr.trim() || `Exit code ${code}`));
          }
        });
      });
    });
  }

  /**
   * Arguments every yt-dlp invocation carries: the request pacing, and — each
   * only when configured — account cookies and the PO token provider (the
   * bgutil plugin reads its base_url from this extractor arg). The JS runtime
   * needs no arg: ytdlp-nodejs passes `--js-runtime node` on its own.
   */
  private baseArgs(): string[] {
    const args: string[] = [
      "--sleep-requests",
      SLEEP_BETWEEN_REQUESTS_S,
      "--sleep-subtitles",
      SLEEP_BEFORE_SUBTITLES_S,
    ];
    if (this.cookiesFile) args.push("--cookies", this.cookiesFile);
    if (this.potProviderUrl) {
      args.push(
        "--extractor-args",
        `youtubepot-bgutilhttp:base_url=${this.potProviderUrl}`,
      );
    }
    return args;
  }

  private buildExec(url: string, args: string[]) {
    const builder = this.ytdlp.execBuilder(url).addArgs(...args);
    builder.debugPrint(false);
    return builder;
  }

  /**
   * Runs yt-dlp with the base args prepended and turns a non-zero exit into
   * the failure the caller should see; warnings from a successful run are
   * logged so they are not lost.
   */
  private async runChecked(
    url: string,
    remainingArgs: string[],
  ): Promise<Result<YtDlpRunResult, YtDlpError | UnprocessableVideoError>> {
    const result = await this.run(url, [...this.baseArgs(), ...remainingArgs]);

    if (result.exitCode !== 0) {
      const message = result.stderr || `Exit code ${result.exitCode}`;
      const failure = toYtDlpFailure(message);
      if (failure.type === "YT_DLP_ERROR") {
        this.logger.error({
          message: `yt-dlp execution failed with code ${result.exitCode}`,
          context: { stderr: result.stderr, command: result.command },
        });
      }
      return Failure(failure);
    }

    this.logWarnings(result.command ?? url, result.stderr);

    return Success(result);
  }

  /** Surfaces what yt-dlp wrote to stderr on a successful run (its WARNING lines). */
  private logWarnings(command: string, stderr: string): void {
    if (!stderr.trim()) return;
    this.logger.warn(`yt-dlp warnings (${command}):\n${stderr.trim()}`);
  }

  /**
   * ytdlp-nodejs rejects on a non-zero exit with only the first `ERROR:` line
   * of stderr (or "Unknown yt-dlp error" when there is none), so the builder's
   * events are captured to hand the caller the full stderr and the command.
   */
  private async runWithWrapper(
    url: string,
    args: string[],
  ): Promise<YtDlpRunResult> {
    const builder = this.buildExec(url, args);
    let command: string | undefined;
    let stderr = "";
    builder.on("start", (cmd: string) => {
      command = cmd;
    });
    builder.on("stderr", (chunk: string) => {
      stderr += chunk;
    });

    try {
      const result = await builder.exec();
      return {
        exitCode: result.exitCode,
        stdout: result.stdout,
        stderr: result.stderr || stderr,
        command: result.command || command,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // ytdlp-nodejs@3.4.x phrases its rejection as `yt-dlp exited with code N: …`.
      const exitCode = Number(
        message.match(/exited with code (\d+)/)?.[1] ?? 1,
      );
      return { exitCode, stdout: "", stderr: stderr || message, command };
    }
  }

  /**
   * Executes yt-dlp with the specified arguments and parses each line of stdout as a JSON object of type T.
   */
  async execJson<T>(
    args: string[],
  ): Promise<Result<T[], YtDlpError | UnprocessableVideoError>> {
    try {
      this.logger.info(
        `Running yt-dlp via wrapper with args: ${args.join(" ")}`,
      );

      const [url, ...remainingArgs] = args;
      if (!url) {
        return Failure({
          type: "YT_DLP_ERROR",
          message: "URL/Query is required as the first argument",
        });
      }

      const run = await this.runChecked(url, remainingArgs);
      if (!run.ok) return run;

      const results: T[] = [];
      const lines = run.value.stdout.split("\n");

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
        ...error,
      };

      this.logger.error({
        message: "Unexpected error during yt-dlp execution",
        context: errorContext,
      });

      const message = error?.message || "Unexpected error";
      return Failure(toYtDlpFailure(message, errorContext));
    }
  }

  /**
   * Executes yt-dlp with the specified arguments without parsing output.
   * Useful for commands that write to files (e.g., subtitle downloads).
   */
  async exec(
    args: string[],
  ): Promise<Result<void, YtDlpError | UnprocessableVideoError>> {
    try {
      this.logger.info(
        `Running yt-dlp via wrapper with args: ${args.join(" ")}`,
      );

      const [url, ...remainingArgs] = args;
      if (!url) {
        return Failure({
          type: "YT_DLP_ERROR",
          message: "URL/Query is required as the first argument",
        });
      }

      const run = await this.runChecked(url, remainingArgs);
      if (!run.ok) return run;

      return Success(undefined);
    } catch (error: any) {
      const errorContext = {
        name: error?.name,
        message: error?.message,
        stack: error?.stack,
        ...error,
      };

      this.logger.error({
        message: "Unexpected error during yt-dlp execution",
        context: errorContext,
      });

      const message = error?.message || "Unexpected error";
      return Failure(toYtDlpFailure(message, errorContext));
    }
  }

  /**
   * Executes yt-dlp with the specified arguments and yields each line of stdout as a JSON object of type T.
   */
  async *execJsonStream<T>(
    args: string[],
  ): AsyncGenerator<Result<T, YtDlpError>, void, undefined> {
    try {
      this.logger.info(
        `Running yt-dlp via wrapper with args (streaming): ${args.join(" ")}`,
      );

      const [url, ...remainingArgs] = args;
      if (!url) {
        yield Failure({
          type: "YT_DLP_ERROR",
          message: "URL/Query is required as the first argument",
        });
        return;
      }

      const builder = this.buildExec(url, [
        ...this.baseArgs(),
        ...remainingArgs,
      ]);

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
        errorResult = toYtDlpError(error.message, {
          originalError: error,
          stderr: stderrBuffer,
        });
        done = true;
        resolveNext?.();
      });

      const execPromise = builder
        .exec()
        .then((result) => {
          if (buffer.trim()) {
            try {
              queue.push(JSON.parse(buffer));
            } catch {
              this.logger.warn(
                `Failed to parse final yt-dlp output line: ${buffer}`,
              );
            }
          }

          if (result.exitCode !== 0 && !errorResult) {
            errorResult = toYtDlpError(
              result.stderr || `Exit code ${result.exitCode}`,
            );
          } else {
            this.logWarnings(result.command, stderrBuffer);
          }
          done = true;
          resolveNext?.();
        })
        .catch((error) => {
          if (!errorResult) {
            errorResult = toYtDlpError(
              error.message || "Unknown error during yt-dlp execution",
              { originalError: error, stderr: stderrBuffer },
            );
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
        ...error,
      };
      this.logger.error({
        message: "Unexpected error during yt-dlp streaming execution",
        context: errorContext,
      });
      yield Failure({
        type: "YT_DLP_ERROR",
        message: error?.message || "Unexpected error",
        cause: errorContext,
      });
    }
  }
}
