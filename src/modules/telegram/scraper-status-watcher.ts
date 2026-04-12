import { injectable } from "inversify";
import pg from "pg";

import { Logger } from "../_common/logger/logger.js";
import { OnScraperStatusChangeUseCase } from "./on-scraper-status-change.use-case.js";
import { Status } from "../scraping/lifecycle/scraper-status.service.js";

const CHANNEL = "scraper_actual_status_changed";

type StatusChangePayload = {
  old_status: Status;
  new_status: Status;
};

@injectable()
export class ScraperStatusWatcher {
  private client: pg.Client | null = null;
  private readonly logger: Logger;

  constructor(
    logger: Logger,
    private readonly onScraperStatusChangeUseCase: OnScraperStatusChangeUseCase,
  ) {
    this.logger = logger.child({ context: ScraperStatusWatcher.name });
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
      if (msg.channel !== CHANNEL || !msg.payload) return;

      try {
        const payload: StatusChangePayload = JSON.parse(msg.payload);
        this.onStatusChange(payload);
      } catch (error) {
        this.logger.error({ message: "Failed to parse status change payload", error });
      }
    });

    this.client.on("error", (error) => {
      this.logger.error({ message: "PG listener connection error", error });
    });

    this.logger.info(`Listening for ${CHANNEL} notifications.`);
  }

  public async stop(): Promise<void> {
    if (this.client) {
      await this.client.end();
      this.client = null;
      this.logger.info("Stopped listening for status changes.");
    }
  }

  private async onStatusChange(payload: StatusChangePayload): Promise<void> {
    const { old_status: oldStatus, new_status: newStatus } = payload;
    this.logger.info(`Scraper status changed: ${oldStatus} → ${newStatus}`);
    await this.onScraperStatusChangeUseCase.execute({ oldStatus, newStatus });
  }
}
