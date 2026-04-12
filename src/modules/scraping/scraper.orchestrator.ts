import { injectable } from "inversify";

import { Logger } from "../_common/logger/logger.js";
import { BaseError } from "../_common/errors.js";
import { Result, Success, Failure } from "../../types/index.js";
import { ProcessScraperFailureUseCase } from "./error-handling/process-scraper-failure.use-case.js";
import { SearchChannelQueriesWorker } from "./scrapers/channel-discovery/search-channel-queries.worker.js";
import { ChannelEntriesWorker } from "./scrapers/channel/channel-entries.worker.js";
import { ChannelsWorker } from "./scrapers/video-discovery/channels.worker.js";
import { VideoEntriesWorker } from "./scrapers/video/video-entries.worker.js";
import { ScraperName, WorkerStopCause } from "./constants.js";
import { ScraperConfigRepository } from "./config/scraper-config.repository.js";
import { HandleScraperStopUseCase } from "./lifecycle/handle-scraper-stop.use-case.js";

const MINUTE_MS = 1000 * 60;
const HOUR_MS = MINUTE_MS * 60;

export type StopReason =
  | { type: "GRACEFUL" }
  | { type: "ERROR", error: unknown }
  | { type: "QUEUE_EXHAUSTED", scraperName: ScraperName }

export type ScraperAlreadyRunningError = { type: "ScraperAlreadyRunningError" }
export type SeederFailedError = { type: "SeederFailedError"; cause: Error }
export type ScraperNotRunningError = { type: "ScraperNotRunningError" }

type StartError = ScraperAlreadyRunningError
type StopError = ScraperNotRunningError

type Worker = {
  run: (
    params: {
      shouldContinue: () => boolean;
      onError: (error: BaseError) => Promise<void>
    }
  ) => Promise<Result<WorkerStopCause, BaseError>>;
};

type ScraperSessionConfig = {
  name: ScraperName;
  timeoutMs: number;
  worker: Worker;
  order: number;
};

@injectable()
export class ScraperOrchestrator {
  private isRunning = false;
  private shouldContinueFlag = true;
  private loopPromise: Promise<void> | null = null;

  private readonly scrapersConfig: Record<ScraperName, ScraperSessionConfig>;
  private readonly logger: Logger;

  constructor(
    logger: Logger,
    private readonly searchChannelQueriesWorker: SearchChannelQueriesWorker,
    private readonly channelEntriesWorker: ChannelEntriesWorker,
    private readonly channelsWorker: ChannelsWorker,
    private readonly videoEntriesWorker: VideoEntriesWorker,
    private readonly processScraperFailure: ProcessScraperFailureUseCase,
    private readonly scraperConfigRepository: ScraperConfigRepository,
    private readonly handleScraperStopUseCase: HandleScraperStopUseCase,
  ) {
    this.scrapersConfig = {
      [ScraperName.CHANNEL_DISCOVERY]: {
        name: ScraperName.CHANNEL_DISCOVERY,
        timeoutMs: MINUTE_MS * 5,
        worker: this.searchChannelQueriesWorker,
        order: 1,
      },
      [ScraperName.CHANNEL]: {
        name: ScraperName.CHANNEL,
        timeoutMs: MINUTE_MS * 5,
        worker: this.channelEntriesWorker,
        order: 2,
      },
      [ScraperName.VIDEO_DISCOVERY]: {
        name: ScraperName.VIDEO_DISCOVERY,
        timeoutMs: MINUTE_MS * 5,
        worker: this.channelsWorker,
        order: 3,
      },
      [ScraperName.VIDEO]: {
        name: ScraperName.VIDEO,
        timeoutMs: HOUR_MS,
        worker: this.videoEntriesWorker,
        order: 4,
      },
    };

    this.logger = logger.child({ context: "ScraperService", category: "scraper" });
  }

  public getIsRunning(): boolean {
    return this.isRunning;
  }

  public async start(scrapersToRun: ScraperName[]): Promise<Result<void, StartError>> {
    if (this.isRunning) {
      return Failure({ type: "ScraperAlreadyRunningError" });
    }

    this.isRunning = true;
    this.shouldContinueFlag = true;

    const scrapers = scrapersToRun
      .map((name) => this.scrapersConfig[name])
      .sort((a, b) => a.order - b.order);

    this.loopPromise = this.runLoop(scrapers);

    return Success(undefined);
  }

  public async stop(): Promise<Result<void, StopError>> {
    if (!this.isRunning) {
      return Failure({ type: "ScraperNotRunningError" });
    }

    this.shouldContinueFlag = false;
    this.logger.info("Graceful stop requested. Waiting for current item to finish...");

    await this.loopPromise;

    return Success(undefined);
  }

  private async runLoop(scrapers: ScraperSessionConfig[]): Promise<void> {
    let stopReason: StopReason;

    try {
      stopReason = await this.executeLoop(scrapers);
    } catch (error) {
      this.logger.error({ message: "Scraper loop crashed", error });
      stopReason = { type: "ERROR", error };
    }

    this.isRunning = false;
    this.loopPromise = null;

    this.logger.info(`Scraper loop stopped. Reason: ${JSON.stringify(stopReason)}`);

    await this.handleScraperStopUseCase.execute(stopReason);
  }

  private async executeLoop(scrapers: ScraperSessionConfig[]): Promise<StopReason> {
    this.logger.info("Starting scraper loop...");
    this.logger.info(`Enabled scrapers: ${scrapers.map((s) => s.name).join(", ") || "none"}`);

    while (true) {
      for (const scraper of scrapers) {
        if (!this.shouldContinueFlag) {
          this.logger.info("Stop requested, exiting loop.");
          return { type: "GRACEFUL" };
        }

        const scraperStartTime = Date.now();
        const { timeoutMs } = scraper;

        const workerShouldContinue = () => {
          if (!this.shouldContinueFlag) return false;
          return (Date.now() - scraperStartTime) < timeoutMs;
        };

        this.logger.info(`Starting session for ${scraper.name} scraper (${timeoutMs}ms limit)...`);

        try {
          const result = await scraper.worker.run({
            shouldContinue: workerShouldContinue,
            onError: async (error) => { await this.processScraperFailure.execute({ scraperName: scraper.name, error }); },
          });

          if (!result.ok) {
            this.logger.error({ message: `${scraper.name} scraper session failed.`, error: result.error });
            return { type: "ERROR", error: result.error };
          }

          this.logger.info(`${scraper.name} scraper session finished (${result.value}).`);

          if (result.value === WorkerStopCause.EMPTY) {
            this.logger.info(`${scraper.name} exited because queue is empty.`);
            return { type: "QUEUE_EXHAUSTED", scraperName: scraper.name };
          }
        } catch (error) {
          this.logger.error({ message: `Critical error during ${scraper.name} scraper session`, error });
          return { type: "ERROR", error };
        }
      }

      this.logger.info("Cycle finished. Starting over...");
    }
  }
}
