import { injectable } from "inversify";
import { sql } from "kysely";
import { DatabaseClient } from "../../../db/client.js";
import { Logger } from "../../_common/logger/logger.js";
import { ChannelPriorityService } from "./channel-priority.service.js";

const SCHEDULER_INTERVAL_MS = 5 * 60 * 1000;

@injectable()
export class ChannelPriorityScheduler {
  private interval: NodeJS.Timeout | null = null;
  private readonly logger: Logger;

  constructor(
    logger: Logger,
    private readonly db: DatabaseClient,
    private readonly channelPriorityService: ChannelPriorityService,
  ) {
    this.logger = logger.child({ context: ChannelPriorityScheduler.name });
  }

  start(): void {
    this.tick();
    this.interval = setInterval(() => this.tick(), SCHEDULER_INTERVAL_MS);
    this.logger.info("Channel priority scheduler started.");
  }

  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
      this.logger.info("Channel priority scheduler stopped.");
    }
  }

  private tick(): void {
    this.doTick().catch((error) =>
      this.logger.error({ message: "Channel priority scheduler tick failed", error }),
    );
  }

  private async doTick(): Promise<void> {
    const staleChannels = await this.db
      .selectFrom("channelPriorityScores")
      .select("channelId")
      .where(
        sql<boolean>`"last_video_processed_at" IS NOT NULL AND ("calculated_at" IS NULL OR "last_video_processed_at" > "calculated_at")`,
      )
      .orderBy("lastVideoProcessedAt", "asc")
      .limit(100)
      .execute();

    if (staleChannels.length === 0) return;

    this.logger.info(`Recalculating priority for ${staleChannels.length} channels.`);

    for (const { channelId } of staleChannels) {
      const result = await this.channelPriorityService.recalculate(channelId);
      if (!result.ok) {
        this.logger.error({
          message: `Failed to recalculate priority for channel ${channelId}`,
          error: result.error,
        });
      }
    }
  }
}
