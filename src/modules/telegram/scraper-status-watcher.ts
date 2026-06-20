import { injectable } from "inversify";

import { ScrapingProcessStatus } from "../../db/types.js";
import { Logger } from "../_common/logger/logger.js";
import { PgNotificationListener } from "../scraping/lifecycle/pg-notification-listener.js";
import { OnScraperStatusChangeUseCase } from "./on-scraper-status-change.use-case.js";

const CHANNEL = "scraper_actual_status_changed";

type StatusChangePayload = {
  instance_id: string;
  old_status: ScrapingProcessStatus;
  new_status: ScrapingProcessStatus;
};

@injectable()
export class ScraperStatusWatcher {
  private listener: PgNotificationListener | null = null;
  private readonly logger: Logger;

  constructor(
    logger: Logger,
    private readonly onScraperStatusChangeUseCase: OnScraperStatusChangeUseCase,
  ) {
    this.logger = logger.child({ context: ScraperStatusWatcher.name });
  }

  public async start(): Promise<void> {
    this.listener = new PgNotificationListener(this.logger, CHANNEL, (raw) =>
      this.onStatusChange(raw as StatusChangePayload),
    );
    await this.listener.start();
  }

  public async stop(): Promise<void> {
    await this.listener?.stop();
    this.listener = null;
  }

  private async onStatusChange(payload: StatusChangePayload): Promise<void> {
    const {
      instance_id: instanceId,
      old_status: oldStatus,
      new_status: newStatus,
    } = payload;
    this.logger.info(
      `[${instanceId}] Scraper status changed: ${oldStatus} → ${newStatus}`,
    );
    await this.onScraperStatusChangeUseCase.execute({
      instanceId,
      oldStatus,
      newStatus,
    });
  }
}
