import { injectable, unmanaged } from "inversify";
import { PgBoss } from "pg-boss";

import {
  connectionConfigFromEnv,
  type DatabaseConnectionConfig,
} from "../../../db/client.js";
import { Logger } from "../logger/logger.js";
import {
  FAILED_RUNS_QUEUE,
  FAILED_RUNS_QUEUE_SETTINGS,
  relayFailedRuns,
} from "./failed-runs.js";

export type MessagingConnectionOptions = {
  connection?: DatabaseConnectionConfig;
  monitorIntervalSeconds?: number;
};

export type QueueSettings = {
  retryLimit: number;
  retryDelay?: number;
  retryBackoff?: boolean;
  heartbeatSeconds?: number;
  expireInSeconds?: number;
  deadLetter?: string;
};

// Docker gives a container 10 seconds between SIGTERM and SIGKILL. A run still
// active after this is failed by pg-boss rather than left to its heartbeat.
const STOP_TIMEOUT_MS = 5_000;

/**
 * A process's pg-boss instance, which its `EventBus` and `TaskQueue` share,
 * started and stopped here. Bind it as a singleton: a second instance would
 * never be started.
 */
@injectable()
export class MessagingConnection {
  /** For `EventBus` and `TaskQueue` only: nothing else uses pg-boss. */
  readonly boss: PgBoss;

  constructor(
    private readonly logger: Logger,
    @unmanaged() options: MessagingConnectionOptions = {},
  ) {
    this.logger.setContext(MessagingConnection.name);

    this.boss = new PgBoss({
      ...(options.connection ?? connectionConfigFromEnv()),
      migrate: false,
      schedule: false,
      // pg-boss rejects an interval given as undefined.
      ...(options.monitorIntervalSeconds && {
        superviseIntervalSeconds: options.monitorIntervalSeconds,
        monitorIntervalSeconds: options.monitorIntervalSeconds,
      }),
    });

    this.boss.on("error", (error) => {
      this.logger.error({ message: "pg-boss error", error });
    });

    this.boss.on("warning", (warning) => {
      this.logger.warn(`pg-boss warning: ${warning.message}`);
    });
  }

  /** Creates the queue every task's failed runs go to, and relays them. */
  async start(): Promise<void> {
    await this.boss.start();
    await this.createQueue(FAILED_RUNS_QUEUE, FAILED_RUNS_QUEUE_SETTINGS);
    await relayFailedRuns(this.boss);
  }

  async stop(): Promise<void> {
    await this.boss.stop({ graceful: true, timeout: STOP_TIMEOUT_MS });
  }

  /** For `EventBus` and `TaskQueue`: creates a queue, or updates its settings. */
  async createQueue(
    name: string,
    settings: QueueSettings,
    policy?: "exclusive",
  ): Promise<void> {
    await this.boss.createQueue(name, {
      ...settings,
      ...(policy && { policy }),
    });
    // createQueue leaves an existing queue's settings as they were.
    await this.boss.updateQueue(name, settings);
  }
}
