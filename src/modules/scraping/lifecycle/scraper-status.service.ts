import { injectable } from "inversify";

import { Logger } from "../../_common/logger/logger.js";
import { dbClient } from "../../../db/client.js";
import { tryCatch } from "../../_common/try-catch.js";
import { Failure, Success } from "../../../types/index.js";

export type Status = ActualStatus | "PROCESS_DOWN";

type ActualStatus = "IDLE" | "RUNNING" | "STOPPED" | "KILLED" | "ERROR";
type RequestedStatus = "RUNNING" | "STOPPED" | "KILLED";

const HEARTBEAT_TIMEOUT_MS = 30_000;

const ID = 1;

@injectable()
export class ScraperStatusService {
  private readonly logger: Logger;

  constructor(
    logger: Logger,
  ) {
    this.logger = logger.child({ context: ScraperStatusService.name });
  }

  async updateStatus({
    actual,
    requested
  }: {
    actual?: ActualStatus,
    requested?: RequestedStatus
  }) {
    const updateResult = await tryCatch(
      dbClient.updateTable("scrapingProcess")
        .set({
          actualStatus: actual ?? undefined,
          requestedStatus: requested ?? undefined
        })
        .where("id", "=", ID)
        .execute());

    if (!updateResult.ok) {
      return Failure({
        type: "DATABASE",
        error: updateResult.error
      } as const)
    }

    return Success(updateResult.value);
  }

  async getStatus() {
    const result = await tryCatch(
      dbClient.selectFrom("scrapingProcess")
        .select(["actualStatus", "lastHeartbeatAt"])
        .where("id", "=", ID)
        .executeTakeFirst()
    );

    if (!result.ok) {
      return Failure({
        type: "DATABASE",
        error: result.error
      } as const)
    }

    if (!result.value) {
      return Failure({
        type: "DATABASE",
        error: new Error("Scraper process not found")
      } as const)
    }

    const { actualStatus, lastHeartbeatAt } = result.value;
    const isAlive =
      lastHeartbeatAt !== null &&
      (Date.now() - lastHeartbeatAt.getTime()) < HEARTBEAT_TIMEOUT_MS;

    return Success(isAlive ? actualStatus : "PROCESS_DOWN" as const);
  }

  async getRequestedStatus() {
    const result = await tryCatch(
      dbClient.selectFrom("scrapingProcess")
        .select(["requestedStatus"])
        .where("id", "=", ID)
        .executeTakeFirst()
    );

    if (!result.ok) {
      return Failure({
        type: "DATABASE",
        error: result.error
      } as const)
    }

    if (!result.value) {
      return Failure({
        type: "DATABASE",
        error: new Error("Scraper process not found")
      } as const)
    }

    const { requestedStatus } = result.value;
    return Success(requestedStatus);
  }
}