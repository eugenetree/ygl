import * as childProcess from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { createInterface } from "node:readline";
import type { Readable } from "node:stream";
import { inject, injectable, optional } from "inversify";
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
export type PremiumOnlyVideoError = {
  type: "PREMIUM_ONLY_VIDEO";
  message: string;
};
export type UnprocessableVideoError =
  | MembersOnlyVideoError
  | GeoRestrictedVideoError
  | AgeRestrictedVideoError
  | PremiereVideoError
  | RemovedByUploaderVideoError
  | ClaimedContentVideoError
  | PremiumOnlyVideoError;

const MEMBERS_ONLY_MESSAGE =
  "Join this channel to get access to members-only content";
const GEO_RESTRICTED_MESSAGE =
  "The uploader has not made this video available in your country";
const AGE_RESTRICTED_MESSAGES = [
  "Sign in to confirm your age",
  "Take a few minutes to verify your age",
  "Sorry, this content is age-restricted",
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

/**
 * Flags every run carries, ahead of `baseArgs()`: node as the JS runtime
 * (ADR-0004), and the output shape runs keep (ADR-0010) — quiet, with each
 * progress update on its own line.
 */
const FIXED_ARGS = [
  "--js-runtime",
  "node",
  "--quiet",
  "--progress",
  "--newline",
];

const ERROR_LINE_PATTERN = /^ERROR:/m;

export type YtDlpExit = { exitCode: number | null; stderr: string };

/**
 * A running yt-dlp process. `exited` resolves with the exit code and all of
 * stderr, including on a non-zero exit, and rejects only when the process
 * could not be started.
 */
export type YtDlpProcess = {
  lines: AsyncIterable<string>;
  exited: Promise<YtDlpExit>;
  kill: () => void;
};

/**
 * The message a failed run fails with, or undefined when it succeeded.
 * yt-dlp can log an error and still exit 0; such a run is a failure too.
 */
function failureMessage({ exitCode, stderr }: YtDlpExit): string | undefined {
  if (exitCode === 0 && !ERROR_LINE_PATTERN.test(stderr)) return undefined;
  return stderr || `Exit code ${exitCode}`;
}

/** The boundary to the yt-dlp binary: starts it with the fully composed args. Injected in tests. */
export type YtDlpSpawn = (args: string[]) => YtDlpProcess;
export const YT_DLP_SPAWN = Symbol.for("YT_DLP_SPAWN");

const spawnYtDlp: YtDlpSpawn = (args) => {
  const child = childProcess.spawn("yt-dlp", args);

  let stderr = "";
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk: string) => {
    stderr += chunk;
  });

  const exited = new Promise<YtDlpExit>((resolve, reject) => {
    child.on("error", reject);
    child.on("close", (exitCode) => resolve({ exitCode, stderr }));
  });
  // A consumer awaits `exited` only after reading stdout; until then a
  // spawn failure must not surface as an unhandled rejection.
  exited.catch(() => {});

  return {
    lines: linesOf(child.stdout),
    exited,
    kill: () => child.kill("SIGKILL"),
  };
};

/**
 * Reads `stream` line by line into a queue as fast as the process writes, so
 * a consumer that is slow or has stopped reading never leaves yt-dlp blocked
 * on a full pipe.
 */
function linesOf(stream: Readable): AsyncIterable<string> {
  const queue: string[] = [];
  let closed = false;
  let wake: (() => void) | undefined;

  const reader = createInterface({ input: stream, crlfDelay: Infinity });
  reader.on("line", (line) => {
    queue.push(line);
    wake?.();
  });
  reader.on("close", () => {
    closed = true;
    wake?.();
  });

  return {
    async *[Symbol.asyncIterator]() {
      while (true) {
        const line = queue.shift();
        if (line !== undefined) {
          yield line;
        } else if (closed) {
          return;
        } else {
          await new Promise<void>((resolve) => {
            wake = resolve;
          });
          wake = undefined;
        }
      }
    },
  };
}

async function collect(child: YtDlpProcess) {
  const stdout: string[] = [];
  for await (const line of child.lines) stdout.push(line);
  return { stdout, ...(await child.exited) };
}

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
  private readonly cookiesFile: string | undefined;
  private readonly potProviderUrl: string | undefined;
  private readonly spawn: YtDlpSpawn;

  // The spawn is a function type, so it needs an explicit token: without
  // `@inject` inversify would try to resolve `Function` from its metadata.
  constructor(
    private readonly logger: Logger,
    @optional() @inject(YT_DLP_SPAWN) spawn?: YtDlpSpawn,
  ) {
    this.logger.setContext(YtDlpClient.name);

    this.cookiesFile = resolveCookiesFile(this.logger);
    this.potProviderUrl = process.env["YTDLP_POT_PROVIDER_URL"] || undefined;
    this.spawn = spawn ?? spawnYtDlp;
  }

  /**
   * Returns the version of the yt-dlp binary in use, or undefined if it
   * cannot be resolved. Safe to call at startup: bounded by a timeout so a
   * wedged binary can't stall boot.
   */
  async getVersion(): Promise<string | undefined> {
    const child = this.spawn(["--version"]);
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        child.kill();
        reject(
          new Error(
            `Timed out after ${VERSION_RESOLUTION_TIMEOUT_MS}ms resolving version`,
          ),
        );
      }, VERSION_RESOLUTION_TIMEOUT_MS);
      timer.unref?.();
    });

    try {
      const { stdout, exitCode, stderr } = await Promise.race([
        collect(child),
        timeout,
      ]);
      if (exitCode !== 0) {
        throw new Error(stderr.trim() || `Exit code ${exitCode}`);
      }
      // yt-dlp prints just the version (e.g. `2025.01.15`) + newline.
      return stdout.join("\n").trim();
    } catch (error) {
      this.logger.warn(
        `Failed to resolve yt-dlp version: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return undefined;
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Arguments every yt-dlp invocation carries: the request pacing, and — each
   * only when configured — account cookies and the PO token provider (the
   * bgutil plugin reads its base_url from this extractor arg).
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

  // `--` so the URL is never read as a flag.
  private composeArgs(url: string, args: string[]): string[] {
    return [...FIXED_ARGS, ...this.baseArgs(), ...args, "--", url];
  }

  /**
   * Runs yt-dlp to completion and turns a failed run into the failure the
   * caller should see; warnings from a successful run are logged so they are
   * not lost.
   */
  private async runChecked(
    url: string,
    remainingArgs: string[],
  ): Promise<Result<string[], YtDlpError | UnprocessableVideoError>> {
    const args = this.composeArgs(url, remainingArgs);
    const command = `yt-dlp ${args.join(" ")}`;
    const { stdout, ...exit } = await collect(this.spawn(args));
    const { exitCode, stderr } = exit;

    const message = failureMessage(exit);
    if (message !== undefined) {
      const failure = toYtDlpFailure(message);
      if (failure.type === "YT_DLP_ERROR") {
        this.logger.error({
          message: `yt-dlp execution failed with code ${exitCode}`,
          context: { stderr, command },
        });
      }
      return Failure(failure);
    }

    this.logWarnings(command, stderr);

    return Success(stdout);
  }

  /** Surfaces what yt-dlp wrote to stderr on a successful run (its WARNING lines). */
  private logWarnings(command: string, stderr: string): void {
    if (!stderr.trim()) return;
    this.logger.warn(`yt-dlp warnings (${command}):\n${stderr.trim()}`);
  }

  /**
   * Executes yt-dlp with the specified arguments and parses each line of stdout as a JSON object of type T.
   */
  async execJson<T>(
    args: string[],
  ): Promise<Result<T[], YtDlpError | UnprocessableVideoError>> {
    try {
      this.logger.info(`Running yt-dlp with args: ${args.join(" ")}`);

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

      for (const line of run.value) {
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
      this.logger.info(`Running yt-dlp with args: ${args.join(" ")}`);

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
        `Running yt-dlp with args (streaming): ${args.join(" ")}`,
      );

      const [url, ...remainingArgs] = args;
      if (!url) {
        yield Failure({
          type: "YT_DLP_ERROR",
          message: "URL/Query is required as the first argument",
        });
        return;
      }

      const fullArgs = this.composeArgs(url, remainingArgs);
      const child = this.spawn(fullArgs);

      let readToEnd = false;
      try {
        for await (const line of child.lines) {
          if (!line.trim()) continue;

          let entry: T;
          try {
            entry = JSON.parse(line);
          } catch {
            this.logger.warn(`Failed to parse yt-dlp output line: ${line}`);
            continue;
          }
          yield Success(entry);
        }
        readToEnd = true;
      } finally {
        // Left alone, a consumer that stopped early leaves yt-dlp paging
        // through the rest of the playlist, spending YouTube's rate limit.
        if (!readToEnd) child.kill();
      }

      let exit: YtDlpExit;
      try {
        exit = await child.exited;
      } catch (error) {
        const message = error instanceof Error ? error.message : "";
        yield Failure(
          toYtDlpError(message || "Unknown error during yt-dlp execution", {
            originalError: error,
          }),
        );
        return;
      }

      const message = failureMessage(exit);
      if (message !== undefined) {
        yield Failure(toYtDlpError(message));
        return;
      }

      this.logWarnings(`yt-dlp ${fullArgs.join(" ")}`, exit.stderr);
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
