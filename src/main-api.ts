import "reflect-metadata";

import { Container } from "inversify";

import { Logger } from "./modules/_common/logger/logger.js";
import { ApiServer } from "./modules/api/api-server.js";

async function main() {
  if (!process.env.IS_API_ENABLED) {
    console.log("IS_API_ENABLED not set, exiting");
    return;
  }

  const container = new Container({ autobind: true });
  container.bind(Logger).toDynamicValue(() => new Logger({ context: "main-api", category: "main" }));

  const apiServer = container.get(ApiServer);
  apiServer.start();

  process.on("SIGTERM", () => process.exit(0));
  process.on("SIGINT", () => process.exit(0));
}

main().catch((err) => {
  console.error("Critical error in main-api:", err);
  process.exit(1);
});
