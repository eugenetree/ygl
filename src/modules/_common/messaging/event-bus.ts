import { injectable, unmanaged } from "inversify";
import type { JobWithMetadata, PgBoss } from "pg-boss";
import type { z } from "zod";

import type { Result } from "../../../types/index.js";
import type { BaseError } from "../errors.js";
import { Logger } from "../logger/logger.js";
import { failureError } from "./failure-error.js";
import {
  MessagingConnection,
  type QueueSettings,
} from "./messaging-connection.js";

/** An event's name, and the schema its payloads are parsed with. */
export type EventDefinition<Payload> = {
  readonly name: string;
  readonly schema: z.ZodType<Payload, z.ZodTypeDef, unknown>;
};

/** A `Failure` gets the event again later. */
export type EventHandler<Payload> = (
  payload: Payload,
) => Promise<Result<void, BaseError>>;

export type EventRetries = Pick<
  QueueSettings,
  "retryLimit" | "retryDelay" | "retryBackoff"
>;

// An event whose handler fails, say while Telegram is unreachable, is delivered
// again later: 30 s, then doubling, for about two hours.
const EVENT_RETRIES: EventRetries = {
  retryLimit: 8,
  retryDelay: 30,
  retryBackoff: true,
};

/**
 * Publishing events, and handling them as a named consumer.
 *
 * - Once `publish` resolves, the event is kept for every consumer that has
 *   ever subscribed to it, whether or not it's running. A consumer doesn't get
 *   what was published before its first `subscribe`.
 * - Delivery is at least once and unordered, so a handler can see an event
 *   twice.
 * - A handler's `Failure` gets the event again, later each time, for about two
 *   hours; then an error is logged and the event is given up on.
 * - A payload that doesn't match the event's schema is dropped with an error
 *   logged: publishers and subscribers are deployed separately.
 */
@injectable()
export class EventBus {
  private readonly boss: PgBoss;
  private readonly logger: Logger;

  constructor(
    private readonly messagingConnection: MessagingConnection,
    logger: Logger,
    @unmanaged() private readonly retries: EventRetries = EVENT_RETRIES,
  ) {
    this.boss = messagingConnection.boss;
    this.logger = logger.child({ context: EventBus.name });
  }

  async publish<Payload extends object>(
    event: EventDefinition<Payload>,
    payload: Payload,
  ): Promise<void> {
    await this.boss.publish(event.name, payload);
  }

  /**
   * Each consumer gets its own copy of every event. Name it after who consumes
   * the event: two subscribing under one name take events from each other.
   */
  async subscribe<Payload>(
    event: EventDefinition<Payload>,
    consumer: string,
    handler: EventHandler<Payload>,
  ): Promise<void> {
    const queue = `${event.name}.${consumer}`;
    await this.messagingConnection.createQueue(queue, this.retries);
    await this.boss.subscribe(event.name, queue);
    await this.boss.work(queue, { includeMetadata: true }, async ([job]) => {
      const parsed = event.schema.safeParse(job.data);
      // Delivering it again wouldn't change its payload.
      if (!parsed.success) {
        this.logger.error({
          message: `Dropped ${event.name} ${job.id} for ${consumer}: its payload doesn't match the event`,
          error: parsed.error,
        });
        return;
      }
      await this.deliver(
        job,
        `${event.name} ${job.id} for ${consumer}`,
        handler,
        parsed.data,
      );
    });
  }

  /** Hands `payload` to `handler`, logging the attempt after which pg-boss gives up. */
  private async deliver<Payload>(
    job: Pick<JobWithMetadata<unknown>, "data" | "retryCount" | "retryLimit">,
    what: string,
    handler: EventHandler<Payload>,
    payload: Payload,
  ): Promise<void> {
    const result = await handler(payload);
    if (result.ok) {
      return;
    }
    const error = failureError(result.error);
    const attempts = job.retryCount + 1;
    if (job.retryCount >= job.retryLimit) {
      this.logger.error({
        message: `Gave up on ${what} after ${attempts} attempts`,
        error,
        context: { payload: job.data },
      });
    } else {
      this.logger.warn(
        `Attempt ${attempts} at ${what} failed: ${error.message}`,
      );
    }
    throw error;
  }
}
