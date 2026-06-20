import pg from "pg";
import { Logger } from "../../_common/logger/logger.js";

type NotificationHandler = (payload: unknown) => void;

export class PgNotificationListener {
  private client: pg.Client | null = null;
  private readonly logger: Logger;

  constructor(
    logger: Logger,
    private readonly channel: string,
    private readonly onNotification: NotificationHandler,
  ) {
    this.logger = logger.child({
      context: `${PgNotificationListener.name}:${channel}`,
    });
  }

  async start(): Promise<void> {
    this.client = new pg.Client({
      database: process.env.POSTGRES_DB,
      host: process.env.DB_HOST,
      user: process.env.POSTGRES_USER,
      password: process.env.POSTGRES_PASSWORD,
      port: Number(process.env.DB_PORT),
    });

    await this.client.connect();
    await this.client.query(`LISTEN ${this.channel}`);

    this.client.on("notification", (msg) => {
      if (msg.channel !== this.channel || !msg.payload) return;

      let parsed: unknown;
      try {
        parsed = JSON.parse(msg.payload);
      } catch (error) {
        this.logger.error({
          message: "Failed to parse notification payload",
          error,
          context: { payload: msg.payload },
        });
        return;
      }

      this.onNotification(parsed);
    });

    this.client.on("error", (error) => {
      this.logger.error({
        message: "PG listener connection error",
        error,
      });
    });

    this.logger.info(`Listening on channel ${this.channel}`);
  }

  async stop(): Promise<void> {
    if (this.client) {
      await this.client.end();
      this.client = null;
      this.logger.info(`Stopped listening on channel ${this.channel}`);
    }
  }
}
