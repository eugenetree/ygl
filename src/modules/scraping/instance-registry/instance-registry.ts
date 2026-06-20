import { injectable } from "inversify";
import { DatabaseClient } from "../../../db/client.js";
import { DatabaseError, ScrapingProcessStatus } from "../../../db/types.js";
import { Failure, Result, Success } from "../../../types/index.js";
import { tryCatch } from "../../_common/try-catch.js";

export type ActualStatus = ScrapingProcessStatus;
export type RequestedStatus = "RUNNING" | "STOPPED" | "KILLED";
export type Status = ActualStatus | "PROCESS_DOWN";

const HEARTBEAT_TIMEOUT_MS = 30_000;

export type ScrapingInstance = {
  instanceId: string;
  actualStatus: ActualStatus;
  requestedStatus: RequestedStatus;
  updatedAt: Date | null;
  lastHeartbeatAt: Date | null;
};

@injectable()
export class InstanceRegistry {
  constructor(private readonly db: DatabaseClient) {}

  async register(
    instanceId: string,
  ): Promise<Result<{ isNew: boolean }, DatabaseError>> {
    const existing = await tryCatch(
      this.db
        .selectFrom("scrapingProcess")
        .select("instanceId")
        .where("instanceId", "=", instanceId)
        .executeTakeFirst(),
    );

    if (!existing.ok) {
      return Failure({ type: "DATABASE", error: existing.error });
    }

    if (existing.value) {
      return Success({ isNew: false });
    }

    const insert = await tryCatch(
      this.db
        .insertInto("scrapingProcess")
        .values({
          instanceId,
          actualStatus: "STOPPED",
          requestedStatus: "STOPPED",
        })
        .execute(),
    );

    if (!insert.ok) {
      return Failure({ type: "DATABASE", error: insert.error });
    }

    return Success({ isNew: true });
  }

  async list(): Promise<Result<ScrapingInstance[], DatabaseError>> {
    const result = await tryCatch(
      this.db.selectFrom("scrapingProcess").selectAll().execute(),
    );

    if (!result.ok) {
      return Failure({ type: "DATABASE", error: result.error });
    }

    return Success(
      result.value.map((row) => ({
        instanceId: row.instanceId,
        actualStatus: row.actualStatus,
        requestedStatus: row.requestedStatus as RequestedStatus,
        updatedAt: row.updatedAt,
        lastHeartbeatAt: row.lastHeartbeatAt,
      })),
    );
  }

  async getActualStatus(
    instanceId: string,
  ): Promise<Result<Status, DatabaseError>> {
    const result = await tryCatch(
      this.db
        .selectFrom("scrapingProcess")
        .select(["actualStatus", "lastHeartbeatAt"])
        .where("instanceId", "=", instanceId)
        .executeTakeFirst(),
    );

    if (!result.ok) {
      return Failure({ type: "DATABASE", error: result.error });
    }

    if (!result.value) {
      return Failure({
        type: "DATABASE",
        error: new Error(`Scraper instance not found: ${instanceId}`),
      });
    }

    const { actualStatus, lastHeartbeatAt } = result.value;
    const isAlive =
      lastHeartbeatAt !== null &&
      Date.now() - lastHeartbeatAt.getTime() < HEARTBEAT_TIMEOUT_MS;

    return Success(isAlive ? actualStatus : ("PROCESS_DOWN" as const));
  }

  async getRequestedStatus(
    instanceId: string,
  ): Promise<Result<RequestedStatus, DatabaseError>> {
    const result = await tryCatch(
      this.db
        .selectFrom("scrapingProcess")
        .select(["requestedStatus"])
        .where("instanceId", "=", instanceId)
        .executeTakeFirst(),
    );

    if (!result.ok) {
      return Failure({ type: "DATABASE", error: result.error });
    }

    if (!result.value) {
      return Failure({
        type: "DATABASE",
        error: new Error(`Scraper instance not found: ${instanceId}`),
      });
    }

    return Success(result.value.requestedStatus as RequestedStatus);
  }

  async updateStatus(
    instanceId: string,
    update: { actual?: ActualStatus; requested?: RequestedStatus },
  ): Promise<Result<void, DatabaseError>> {
    const result = await tryCatch(
      this.db
        .updateTable("scrapingProcess")
        .set({
          actualStatus: update.actual ?? undefined,
          requestedStatus: update.requested ?? undefined,
        })
        .where("instanceId", "=", instanceId)
        .execute(),
    );

    if (!result.ok) {
      return Failure({ type: "DATABASE", error: result.error });
    }

    return Success(undefined);
  }

  async recordHeartbeat(
    instanceId: string,
  ): Promise<Result<void, DatabaseError>> {
    const result = await tryCatch(
      this.db
        .updateTable("scrapingProcess")
        .set({ lastHeartbeatAt: new Date() })
        .where("instanceId", "=", instanceId)
        .execute(),
    );

    if (!result.ok) {
      return Failure({ type: "DATABASE", error: result.error });
    }

    return Success(undefined);
  }
}
