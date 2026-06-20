import { injectable } from "inversify";
import { Logger } from "../../_common/logger/logger.js";
import { InstanceRegistry } from "../instance-registry/instance-registry.js";

const HEARTBEAT_INTERVAL_MS = 10_000;

@injectable()
export class ScraperHeartbeat {
  private interval: NodeJS.Timeout | null = null;
  private readonly logger: Logger;
  private readonly instanceId: string;

  constructor(
    logger: Logger,
    private readonly instanceRegistry: InstanceRegistry,
  ) {
    this.logger = logger.child({ context: ScraperHeartbeat.name });
    this.instanceId = process.env.SCRAPER_INSTANCE_ID ?? "";
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
    this.instanceRegistry
      .recordHeartbeat(this.instanceId)
      .catch((error) =>
        this.logger.error({ message: "Failed to write heartbeat", error }),
      );
  }
}
