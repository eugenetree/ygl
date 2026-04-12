import { injectable } from "inversify";

import { Logger } from "../../_common/logger/logger.js";
import { dbClient } from "../../../db/client.js";

const HEARTBEAT_INTERVAL_MS = 10_000;

@injectable()
export class ScraperHeartbeat {
  private interval: NodeJS.Timeout | null = null;
  private readonly logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger.child({ context: ScraperHeartbeat.name });
  }

  start(): void {
    this.beat();
    this.interval = setInterval(() => this.beat(), HEARTBEAT_INTERVAL_MS);
    this.logger.info("Heartbeat started.");
  }

  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
      this.logger.info("Heartbeat stopped.");
    }
  }

  private beat(): void {
    dbClient
      .updateTable("scrapingProcess")
      .set({ lastHeartbeatAt: new Date() })
      .where("id", "=", 1)
      .execute()
      .catch((error) => this.logger.error({ message: "Failed to write heartbeat", error }));
  }
}
