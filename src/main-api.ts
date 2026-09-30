import "reflect-metadata";

import { Client } from "@elastic/elasticsearch";
import { Container } from "inversify";

import { Logger } from "./modules/_common/logger/logger.js";
import { API_CONFIG, parseApiConfig } from "./modules/api/api-config.js";
import { SearchController } from "./modules/api/controllers/search.controller.js";
import { buildHttpServer } from "./modules/api/http-server.js";
import { CaptionsService } from "./modules/captions-search/captions.service.js";

async function main() {
  if (!process.env.IS_API_ENABLED) {
    console.log("IS_API_ENABLED not set, exiting");
    return;
  }

  const config = parseApiConfig(process.env);

  const container = new Container({ autobind: true });
  container
    .bind(Logger)
    .toDynamicValue(
      () => new Logger({ context: "main-api", category: "main" }),
    );
  container.bind(API_CONFIG).toConstantValue(config);
  container
    .bind(CaptionsService)
    .toDynamicValue(
      (context) =>
        new CaptionsService(
          context.get(Logger),
          new Client({ node: config.esNode }),
        ),
    )
    .inSingletonScope();

  const logger = container.get(Logger);
  const app = buildHttpServer({
    logger,
    frontendOrigin: config.frontendOrigin,
    controllers: [container.get(SearchController)],
  });

  const shutdown = async () => {
    logger.info("Closing API server...");
    await app.close();
    process.exit(0);
  };
  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);

  await app.listen({ port: config.port, host: "0.0.0.0" });
  logger.info(`API server listening on port ${config.port}`);
}

main().catch((err) => {
  console.error("Critical error in main-api:", err);
  process.exit(1);
});
