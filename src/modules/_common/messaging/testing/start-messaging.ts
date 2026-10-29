import type { Logger } from "../../logger/logger.js";
import { createLoggerMock } from "../../logger/testing/logger-mock.js";
import { EventBus, type EventRetries } from "../event-bus.js";
import {
  MessagingConnection,
  type MessagingConnectionOptions,
} from "../messaging-connection.js";
import { TaskQueue } from "../task-queue.js";

export type StartedMessaging = {
  eventBus: EventBus;
  taskQueue: TaskQueue;
  stop(): Promise<void>;
};

// tsx emits no decorator metadata for a container to inject by, so this builds
// what a container would by hand.
export async function startMessaging(
  options: MessagingConnectionOptions & { eventRetries?: EventRetries },
  mockLogger = createLoggerMock(),
): Promise<StartedMessaging> {
  const logger = mockLogger as unknown as Logger;
  const messagingConnection = new MessagingConnection(logger, options);
  const eventBus = new EventBus(
    messagingConnection,
    logger,
    options.eventRetries,
  );
  const taskQueue = new TaskQueue(messagingConnection, eventBus, logger);
  await messagingConnection.start();
  return { eventBus, taskQueue, stop: () => messagingConnection.stop() };
}
