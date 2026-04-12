import { injectable } from "inversify";
import pg from "pg";

import { Logger } from "../../_common/logger/logger.js";
import { StartScraperUseCase } from "./start-scraper.use-case.js";
import { StopScraperUseCase } from "./stop-scraper.use-case.js";
import type { ScrapingProcessStatus } from "../../../db/types.js";

const CHANNEL = "scraper_requested_status_changed";

type StatusChangePayload = {
  old_status: ScrapingProcessStatus;
  new_status: ScrapingProcessStatus;
};

@injectable()
export class ScraperCommandListener {
  private client: pg.Client | null = null;
  private readonly logger: Logger;

  constructor(
    logger: Logger,
    private readonly startScraperUseCase: StartScraperUseCase,
    private readonly stopScraperUseCase: StopScraperUseCase,
  ) {
    this.logger = logger.child({ context: ScraperCommandListener.name });
  }

  public async start(): Promise<void> {
    this.client = new pg.Client({
      database: process.env.POSTGRES_DB,
      host: process.env.DB_HOST,
      user: process.env.POSTGRES_USER,
      password: process.env.POSTGRES_PASSWORD,
      port: Number(process.env.DB_PORT),
    });

    await this.client.connect();
    await this.client.query(`LISTEN ${CHANNEL}`);

    this.client.on("notification", (msg) => {
      this.logger.info(`Received notification: ${msg.payload}`);
      if (msg.channel !== CHANNEL || !msg.payload) return;

      try {
        const payload: StatusChangePayload = JSON.parse(msg.payload);
        this.onRequestedStatusChange(payload);
      } catch (error) {
        this.logger.error({ message: "Failed to parse requested status change payload", error });
      }
    });

    this.client.on("error", (error) => {
      this.logger.error({ message: "PG listener connection error in command listener", error });
    });

    this.logger.info(`Listening for ${CHANNEL} commands.`);
  }

  public async stop(): Promise<void> {
    if (this.client) {
      await this.client.end();
      this.client = null;
      this.logger.info("Stopped listening for commands.");
    }
  }

  private async onRequestedStatusChange(payload: StatusChangePayload): Promise<void> {
    const { new_status } = payload;
    this.logger.info(`Received command payload: requested_status changed to ${new_status}`);

    if (new_status === "RUNNING") {
      await this.startScraperUseCase.execute();
    } else if (new_status === "STOPPED") {
      await this.stopScraperUseCase.execute();
    }
  }
}
