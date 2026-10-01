import "reflect-metadata";

import { Client } from "@elastic/elasticsearch";
import { Container } from "inversify";

import { DatabaseClient } from "./db/client.js";
import { Logger } from "./modules/_common/logger/logger.js";
import { API_CONFIG, parseApiConfig } from "./modules/api/api-config.js";
import { MeController } from "./modules/api/controllers/me.controller.js";
import { SearchController } from "./modules/api/controllers/search.controller.js";
import { buildHttpServer } from "./modules/api/http-server.js";
import { createAuth } from "./modules/auth/auth.js";
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
    .bind(DatabaseClient)
    .toConstantValue(new DatabaseClient(config.database));
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

  const db = container.get(DatabaseClient);
  const auth = createAuth(db, {
    secret: config.authSecret,
    publicOrigin: config.publicOrigin,
    google: config.google,
  });

  const logger = container.get(Logger);
  const app = buildHttpServer({
    logger,
    auth,
    controllers: [container.get(SearchController), container.get(MeController)],
  });

  const shutdown = async () => {
    logger.info("Closing API server...");
    await app.close();
    await db.destroy();
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
