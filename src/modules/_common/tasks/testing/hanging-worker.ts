// A worker process for tests to kill mid-run. Usage:
//   node --import tsx hanging-worker.ts '<{ connection, task } as JSON>'
// Prints "started" once it holds a run, then never finishes it.

import type { DatabaseConnectionConfig } from "../../../../db/client.js";
import type { Logger } from "../../logger/logger.js";
import { createLoggerMock } from "../../logger/testing/logger-mock.js";
import type { AnyTask } from "../task-definitions.js";
import { Tasks } from "../tasks.js";

async function main() {
  const { connection, task } = JSON.parse(process.argv[2]) as {
    connection: DatabaseConnectionConfig;
    task: AnyTask;
  };
  const tasks = new Tasks(createLoggerMock() as unknown as Logger, {
    connection,
    tasks: [task],
  });
  await tasks.start();
  await tasks.work(task, () => {
    process.stdout.write("started\n");
    return new Promise(() => {});
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
