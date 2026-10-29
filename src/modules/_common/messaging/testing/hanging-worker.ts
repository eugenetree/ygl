// A worker process for tests to kill mid-run. Usage:
//   node --import tsx hanging-worker.ts '<{ connection, task: settings } as JSON>'
// Prints "started" once it holds a run, then never finishes it.

import { z } from "zod";

import type { DatabaseConnectionConfig } from "../../../../db/client.js";
import { runCompletedSchema } from "../runs.js";
import type { AnyTask } from "../task-queue.js";
import { startMessaging } from "./start-messaging.js";

async function main() {
  const { connection, task: settings } = JSON.parse(process.argv[2]) as {
    connection: DatabaseConnectionConfig;
    task: {
      name: string;
      expireInSeconds: number;
      heartbeatSeconds?: number;
      runCompleted: string;
    };
  };
  // Its runs never complete, so its event's schema is never used.
  const task: AnyTask = {
    ...settings,
    runCompleted: {
      name: settings.runCompleted,
      schema: runCompletedSchema(z.unknown()),
    },
  };
  const { taskQueue } = await startMessaging({ connection });
  await taskQueue.work(task, () => {
    process.stdout.write("started\n");
    return new Promise(() => {});
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
