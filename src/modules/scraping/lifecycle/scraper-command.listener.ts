import { injectable } from "inversify";
import { ScrapingProcessStatus } from "../../../db/types.js";
import { Logger } from "../../_common/logger/logger.js";
import { PgNotificationListener } from "./pg-notification-listener.js";
import { StartScraperUseCase } from "./start-scraper.use-case.js";
import { StopScraperUseCase } from "./stop-scraper.use-case.js";

const CHANNEL = "scraper_requested_status_changed";

type StatusChangePayload = {
  instance_id: string;
  old_status: ScrapingProcessStatus;
  new_status: ScrapingProcessStatus;
};

@injectable()
export class ScraperCommandListener {
  private listener: PgNotificationListener | null = null;
  private readonly logger: Logger;
  private readonly instanceId: string;

  constructor(
    logger: Logger,
    private readonly startScraperUseCase: StartScraperUseCase,
    private readonly stopScraperUseCase: StopScraperUseCase,
  ) {
    this.logger = logger.child({ context: ScraperCommandListener.name });
    this.instanceId = process.env.SCRAPER_INSTANCE_ID ?? "";
  }

  public async start(): Promise<void> {
    this.listener = new PgNotificationListener(this.logger, CHANNEL, (raw) =>
      this.onNotification(raw),
    );
    await this.listener.start();
  }

  public async stop(): Promise<void> {
    await this.listener?.stop();
    this.listener = null;
  }

  private async onNotification(raw: unknown): Promise<void> {
    const payload = raw as StatusChangePayload;

    if (payload.instance_id !== this.instanceId) {
      this.logger.info(
        `Ignoring command for instance ${payload.instance_id} (ours: ${this.instanceId})`,
      );
      return;
    }

    const { new_status } = payload;
    this.logger.info(
      `Received command: requestedStatus → ${new_status} for ${this.instanceId}`,
    );

    if (new_status === "RUNNING") {
      await this.startScraperUseCase.execute();
    } else if (new_status === "STOPPED") {
      await this.stopScraperUseCase.execute();
    }
  }
}
