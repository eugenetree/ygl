import { injectable } from "inversify";
import { DatabaseClient } from "../../../db/client.js";
import { DatabaseError } from "../../../db/types.js";
import { Failure, Result, Success } from "../../../types/index.js";
import { Logger } from "../../_common/logger/logger.js";
import { tryCatch } from "../../_common/try-catch.js";
import { TelegramNotifier } from "../../telegram/telegram-notifier.js";
import { ScraperName } from "../constants.js";
import { InstanceRegistry } from "./instance-registry.js";

@injectable()
export class RegisterInstanceUseCase {
  private readonly logger: Logger;

  constructor(
    logger: Logger,
    private readonly instanceRegistry: InstanceRegistry,
    private readonly db: DatabaseClient,
    private readonly telegramNotifier: TelegramNotifier,
  ) {
    this.logger = logger.child({ context: RegisterInstanceUseCase.name });
  }

  async execute(
    instanceId: string,
    country: string,
  ): Promise<Result<void, DatabaseError>> {
    const registerResult = await this.instanceRegistry.register(instanceId);
    if (!registerResult.ok) {
      return registerResult;
    }

    const { isNew } = registerResult.value;

    if (!isNew) {
      this.logger.info(
        `Instance ${instanceId} already registered. Skipping config seeding.`,
      );
      return Success(undefined);
    }

    // Create disabled config rows for every scraper stage
    const configInsert = await tryCatch(
      this.db
        .insertInto("scraperConfig")
        .values(
          Object.values(ScraperName).map((name) => ({
            instanceId,
            scraperName: name,
            enabled: false,
          })),
        )
        .execute(),
    );

    if (!configInsert.ok) {
      return Failure({ type: "DATABASE", error: configInsert.error });
    }

    await this.telegramNotifier.sendMessage(
      `New scraper instance registered: ${instanceId} (country: ${country})\n` +
        `All scrapers are disabled. Use /config to arm this instance.`,
    );

    this.logger.info(
      `New instance ${instanceId} registered with all scrapers disabled.`,
    );

    return Success(undefined);
  }
}
